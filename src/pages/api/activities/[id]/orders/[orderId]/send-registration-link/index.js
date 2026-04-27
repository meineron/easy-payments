import crypto from "crypto";
import { connectMain } from "@/lib/mongodb";
import { getClubContext, dualSave } from "@/lib/club-context";
import Club from "@/models/Club";
import { sendCustomRegistrationEmail } from "@/lib/email";
import { sendSMS, toE164 } from "@/lib/sms";
import {
  getDefaultInvitationEmailHtml,
  getDefaultInvitationSms,
  getDefaultInvitationSubject,
  replaceInvitationVars,
} from "@/lib/registration-invitation";

function getContactForTarget(order, target) {
  if (target === "player") {
    return {
      email: order.playerEmail || "",
      phone: toE164(order.playerPhonePrefix || "+1", order.playerPhone),
      name: `${order.playerFirstName} ${order.playerLastName}`,
    };
  }
  if (target === "parent2") {
    return {
      email: order.parent2Email || "",
      phone: toE164(order.parent2PhonePrefix || "+1", order.parent2Phone),
      name: order.parent2FirstName ? `${order.parent2FirstName} ${order.parent2LastName}` : "",
    };
  }
  return {
    email: order.parent1Email || "",
    phone: toE164(order.parent1PhonePrefix || "+1", order.parent1Phone),
    name: order.parent1FirstName ? `${order.parent1FirstName} ${order.parent1LastName}` : "",
  };
}

async function _POST(req, res) {
  try {
    const { ctx, error } = await getClubContext(req, res);
    if (error) return res.status(200).json(error.body, { status: error.status });
    const { Order, Activity } = ctx.models;

    const { id, orderId } = req.query;

    const order = await Order.findOne({ _id: orderId, activityId: id, clubId: ctx.clubId })
      .populate("teamId", "name");
    if (!order) return res.status(404).json({ error: "Order not found" });

    let body = {};
    try { body = req.body; } catch { /* empty body ok */ }

    const recipients = body.recipients || [];
    const { channel } = body;
    const willSend = recipients.length > 0 || channel === "sms" || channel === "email";

    let token = order.registrationToken;
    let tokenChanged = false;
    if (!token || (order.registrationTokenExpiresAt && order.registrationTokenExpiresAt < new Date())) {
      token = crypto.randomUUID();
      order.registrationToken = token;
      order.registrationTokenExpiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
      tokenChanged = true;
    }
    if (willSend) order.linkSentAt = new Date();
    if (tokenChanged || willSend) await dualSave(ctx, order);

    const baseUrl = process.env.NEXTAUTH_URL || "http://localhost:3000";
    const registrationUrl = `${baseUrl}/register/${id}?token=${token}`;

    async function loadEmailContext() {
      await connectMain();
      const [activity, club] = await Promise.all([
        Activity.findById(id, "title coverImage registrationInvitation").lean(),
        Club.findById(ctx.clubId, "name logoUrl language").lean(),
      ]);
      const locale = club?.language || "en";
      const invitation = activity?.registrationInvitation || {};
      const subject = body.subject || invitation.subject || getDefaultInvitationSubject(locale);
      const bodyHtmlTemplate = body.bodyHtml || invitation.bodyHtml || getDefaultInvitationEmailHtml(locale);
      const smsTemplate = body.smsText || invitation.smsText || getDefaultInvitationSms(locale);
      const playerName = `${order.playerFirstName || ""} ${order.playerLastName || ""}`.trim();
      const vars = {
        playerName,
        activityTitle: activity?.title || "",
        teamName: order.teamId?.name || "",
        clubName: club?.name || "",
        coverImage: activity?.coverImage || "",
      };
      return {
        activity, club, locale, playerName, vars,
        resolvedSubject: replaceInvitationVars(subject, vars),
        resolvedBodyHtml: replaceInvitationVars(bodyHtmlTemplate, vars),
        resolvedSmsBody: replaceInvitationVars(smsTemplate, vars).replace(/\{link\}/g, registrationUrl),
      };
    }

    if (recipients.length > 0) {
      const ec = await loadEmailContext();
      const results = { sent: 0, failed: 0, errors: [] };

      for (const r of recipients) {
        const contact = getContactForTarget(order, r.target);
        try {
          if (r.channel === "sms") {
            if (!contact.phone) { results.failed++; results.errors.push(`No phone for ${r.target}`); continue; }
            const smsBody = body.bodyText
              ? replaceInvitationVars(body.bodyText, ec.vars).replace(/\{link\}/g, registrationUrl)
              : ec.resolvedSmsBody;
            await sendSMS({ to: contact.phone, message: smsBody });
            results.sent++;
          } else if (r.channel === "email") {
            if (!contact.email) { results.failed++; results.errors.push(`No email for ${r.target}`); continue; }
            await sendCustomRegistrationEmail(contact.email, {
              subject: ec.resolvedSubject,
              bodyHtml: ec.resolvedBodyHtml,
              playerName: ec.playerName,
              clubName: ec.club?.name || "",
              activityTitle: ec.activity?.title || "",
              registrationUrl,
              logoUrl: ec.club?.logoUrl || null,
              locale: ec.locale,
            });
            results.sent++;
          }
        } catch (err) {
          results.failed++;
          results.errors.push(`${r.target} ${r.channel}: ${err.message}`);
        }
      }

      return res.status(200).json({ success: true, registrationUrl, results });
    }

    if (channel === "sms") {
      const phone = toE164(order.parent1PhonePrefix || "+1", order.parent1Phone);
      if (!phone) return res.status(400).json({ error: "No phone number" });
      const ec = await loadEmailContext();
      const smsBody = body.bodyText
        ? replaceInvitationVars(body.bodyText, ec.vars).replace(/\{link\}/g, registrationUrl)
        : ec.resolvedSmsBody;
      await sendSMS({ to: phone, message: smsBody });
    } else if (channel === "email") {
      if (!order.parent1Email) return res.status(400).json({ error: "No email address" });

      const ec = await loadEmailContext();
      await sendCustomRegistrationEmail(order.parent1Email, {
        subject: ec.resolvedSubject,
        bodyHtml: ec.resolvedBodyHtml,
        playerName: ec.playerName,
        clubName: ec.club?.name || "",
        activityTitle: ec.activity?.title || "",
        registrationUrl,
        logoUrl: ec.club?.logoUrl || null,
        locale: ec.locale,
      });
    }

    return res.status(200).json({ success: true, registrationUrl });
  } catch (error) {
    console.error("Send registration link error:", error);
    return res.status(500).json({ error: "Failed to send registration link" });
  }
}
export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  return _POST(req, res);
}
