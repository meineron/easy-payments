import crypto from "crypto";
import { connectMain } from "@/lib/mongodb";
import { getClubContext, dualSave, dualCreate } from "@/lib/club-context";
import Club from "@/models/Club";
import { sendCustomRegistrationEmail } from "@/lib/email";
import { sendSMS, toE164 } from "@/lib/sms";
import { replaceInvitationVars } from "@/lib/registration-invitation";

function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

function contactsForOrder(order, target) {
  const out = [];
  const pushParent = (idx) => {
    const prefix = `parent${idx}`;
    const firstName = order[`${prefix}FirstName`];
    if (!firstName) return;
    const lastName = order[`${prefix}LastName`] || "";
    const email = order[`${prefix}Email`] || "";
    const phonePrefix = order[`${prefix}PhonePrefix`] || "+1";
    const phone = order[`${prefix}Phone`] || "";
    if (!email && !phone) return;
    out.push({
      role: prefix,
      type: "parent",
      id: String(order._id),
      name: `${firstName} ${lastName}`.trim(),
      email,
      phonePrefix,
      phone,
    });
  };
  const pushPlayer = () => {
    const email = order.playerEmail || "";
    const phone = order.playerPhone || "";
    if (!email && !phone) return;
    out.push({
      role: "player",
      type: "player",
      id: String(order.playerId || order._id),
      name: `${order.playerFirstName || ""} ${order.playerLastName || ""}`.trim(),
      email,
      phonePrefix: order.playerPhonePrefix || "+1",
      phone,
    });
  };

  if (target === "parents" || target === "both") {
    pushParent(1);
    pushParent(2);
  }
  if (target === "player" || target === "both") {
    pushPlayer();
  }
  return out;
}

function substituteTextTokens(text, url) {
  if (!text) return text;
  return text
    .replace(/\{personal_registration_link\}/gi, url)
    .replace(/\{personal_link\}/gi, url)
    .replace(/\{link\}/gi, url);
}

async function _POST(req, res) {
  try {
    const { ctx, error } = await getClubContext(req, res);
    if (error) return res.status(200).json(error.body, { status: error.status });
    const { Order, Activity } = ctx.models;

    const { id } = req.query;
    const body = req.body;
    const {
      orderIds = [],
      target = "parents",
      channel = "email",
      subject = "",
      bodyHtml = "",
      bodyText = "",
      smsNotification = false,
      smsText = "",
    } = body;

    if (!Array.isArray(orderIds) || orderIds.length === 0) {
      return res.status(400).json({ error: "No recipients selected" });
    }
    if (!["parents", "player", "both"].includes(target)) {
      return res.status(400).json({ error: "Invalid target" });
    }
    if (channel === "email") {
      if (!subject.trim()) return res.status(400).json({ error: "Subject is required" });
      if (!bodyHtml.trim()) return res.status(400).json({ error: "Message body is required" });
    } else if (channel === "sms") {
      if (!bodyText.trim()) return res.status(400).json({ error: "SMS message is required" });
    } else {
      return res.status(400).json({ error: "Invalid channel" });
    }

    await connectMain();
    const [activity, club] = await Promise.all([
      Activity.findById(id, "title coverImage").lean(),
      Club.findById(ctx.clubId, "name logoUrl language").lean(),
    ]);
    if (!activity || !club) {
      return res.status(404).json({ error: "Activity or club not found" });
    }

    const orders = await Order.find({
      _id: { $in: orderIds },
      activityId: id,
      clubId: ctx.clubId,
    }).populate("teamId", "name");

    if (orders.length === 0) {
      return res.status(404).json({ error: "No orders found" });
    }

    const baseUrl = process.env.NEXTAUTH_URL || "http://localhost:3000";
    let sent = 0;
    let failed = 0;
    const errors = [];
    const loggedRecipients = [];
    const locale = club.language || "en";

    for (const order of orders) {
      if (!order.registrationToken || (order.registrationTokenExpiresAt && order.registrationTokenExpiresAt < new Date())) {
        order.registrationToken = crypto.randomUUID();
        order.registrationTokenExpiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
      }
      order.linkSentAt = new Date();
      await dualSave(ctx, order);

      const registrationUrl = `${baseUrl}/register/${id}?token=${order.registrationToken}`;
      const contacts = contactsForOrder(order, target);
      const playerName = `${order.playerFirstName || ""} ${order.playerLastName || ""}`.trim();
      const invitationVars = {
        playerName,
        activityTitle: activity.title || "",
        teamName: order.teamId?.name || "",
        clubName: club.name || "",
        coverImage: activity.coverImage || "",
      };
      const resolvedSubject = replaceInvitationVars(subject.trim(), invitationVars);
      const resolvedBodyHtml = replaceInvitationVars(bodyHtml, invitationVars);
      const resolvedBodyText = replaceInvitationVars(bodyText.trim(), invitationVars);

      for (const c of contacts) {
        try {
          if (channel === "email") {
            if (!c.email) { failed++; errors.push(`${c.name}: no email`); continue; }
            await sendCustomRegistrationEmail(c.email, {
              subject: resolvedSubject,
              bodyHtml: resolvedBodyHtml,
              playerName,
              clubName: club.name || "",
              activityTitle: activity.title || "",
              registrationUrl,
              logoUrl: club.logoUrl || null,
              locale,
            });
            sent++;

            if (smsNotification && c.phone) {
              const e164 = toE164(c.phonePrefix || "+1", c.phone);
              if (e164) {
                const text = (smsText || `You have received an email. Subject: ${resolvedSubject}`)
                  .replace(/\{email_subject\}/g, resolvedSubject);
                try { await sendSMS({ to: e164, message: text }); } catch { /* best-effort */ }
              }
            }
          } else {
            const e164 = toE164(c.phonePrefix || "+1", c.phone);
            if (!e164) { failed++; errors.push(`${c.name}: no phone`); continue; }
            const msg = substituteTextTokens(resolvedBodyText, registrationUrl);
            await sendSMS({ to: e164, message: msg });
            sent++;
          }

          loggedRecipients.push({
            type: c.type,
            id: c.id,
            name: c.name,
            email: c.email || "",
            phonePrefix: c.phonePrefix || "",
            phone: c.phone || "",
          });
        } catch (err) {
          failed++;
          errors.push(`${c.name}: ${err.message}`);
          console.error(`Bulk message send failed for ${c.email || c.phone}:`, err.message);
        }
      }

      if (sent % 5 === 0 && sent > 0) await sleep(400);
    }

    const status = sent > 0 ? "sent" : "failed";
    try {
      await dualCreate(ctx, "Message", {
        clubId: ctx.clubId,
        channel,
        subject: channel === "email" ? subject.trim() : "SMS",
        bodyHtml: channel === "email" ? bodyHtml : "",
        bodyText: channel === "sms" ? bodyText.trim() : "",
        recipients: loggedRecipients,
        recipientCount: loggedRecipients.length,
        status,
        smsNotification: channel === "email" ? !!smsNotification : false,
        smsNotificationText: channel === "email" ? (smsText || "") : "",
      });
    } catch (err) {
      console.error("Failed to log bulk message:", err.message);
    }

    return res.status(200).json({
      success: sent > 0,
      sent,
      failed,
      total: sent + failed,
      errors: errors.slice(0, 10),
    });
  } catch (error) {
    console.error("Bulk send message error:", error);
    return res.status(500).json({ error: "Failed to send messages" });
  }
}
export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  return _POST(req, res);
}
