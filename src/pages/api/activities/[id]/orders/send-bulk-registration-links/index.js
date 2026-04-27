import mongoose from "mongoose";
import crypto from "crypto";
import { connectMain } from "@/lib/mongodb";
import { getClubContext, dualSave } from "@/lib/club-context";
import Club from "@/models/Club";
import { sendCustomRegistrationEmail } from "@/lib/email";
import { sendSMS, toE164 } from "@/lib/sms";
import { replaceInvitationVars } from "@/lib/registration-invitation";

function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

async function _POST(req, res) {
  try {
    const { ctx, error } = await getClubContext(req, res);
    if (error) return res.status(200).json(error.body, { status: error.status });
    const { Order, Activity } = ctx.models;

    const { id } = req.query;
    const body = req.body;
    const { teamIds, subject, bodyHtml, channel = "email", smsText, smsNotification } = body;

    if (!teamIds?.length) {
      return res.status(400).json({ error: "Select at least one team" });
    }

    await connectMain();
    const [activity, club] = await Promise.all([
      Activity.findById(id, "title coverImage").lean(),
      Club.findById(ctx.clubId, "name logoUrl language").lean(),
    ]);

    if (!activity || !club) {
      return res.status(404).json({ error: "Activity or club not found" });
    }

    const teamObjectIds = teamIds.map((t) => {
      try { return new mongoose.Types.ObjectId(t); } catch { return t; }
    });

    const filter = {
      activityId: id,
      clubId: ctx.clubId,
      teamId: { $in: teamObjectIds },
      parent1Email: { $exists: true, $ne: "" },
    };
    const orders = await Order.find(filter).populate("teamId", "name");

    if (orders.length === 0) {
      return res.status(404).json({ error: "No orders with parent emails found for selected teams" });
    }

    const baseUrl = process.env.NEXTAUTH_URL || "http://localhost:3000";
    let sentCount = 0;
    let errorCount = 0;

    for (const order of orders) {
      try {
        if (!order.registrationToken || (order.registrationTokenExpiresAt && order.registrationTokenExpiresAt < new Date())) {
          order.registrationToken = crypto.randomUUID();
          order.registrationTokenExpiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
        }
        order.linkSentAt = new Date();
        await dualSave(ctx, order);

        const registrationUrl = `${baseUrl}/register/${id}?token=${order.registrationToken}`;
        const orderPhoneE164 = toE164(order.parent1PhonePrefix || "+1", order.parent1Phone);

        const playerName = `${order.playerFirstName} ${order.playerLastName}`.trim();
        const teamName = order.teamId?.name || "";
        const vars = {
          playerName,
          activityTitle: activity.title || "",
          teamName,
          clubName: club.name || "",
          coverImage: activity.coverImage || "",
        };

        if (channel === "sms") {
          if (orderPhoneE164) {
            const resolved = replaceInvitationVars(smsText || "", vars).replace(/\{link\}/g, registrationUrl);
            await sendSMS({ to: orderPhoneE164, message: resolved });
          }
        } else {
          const resolvedSubject = replaceInvitationVars(
            subject || `${activity.title} — Registration`,
            vars,
          );
          const resolvedBody = replaceInvitationVars(
            bodyHtml || "<p>Please complete your registration.</p>",
            vars,
          );

          await sendCustomRegistrationEmail(order.parent1Email, {
            subject: resolvedSubject,
            bodyHtml: resolvedBody,
            playerName,
            clubName: club.name || "",
            activityTitle: activity.title || "",
            registrationUrl,
            logoUrl: club.logoUrl || null,
            locale: club.language || "en",
          });

          if (smsNotification && orderPhoneE164) {
            const smsBody = (body.smsText || `You have received an email. Subject: ${resolvedSubject}`).replace(/\{email_subject\}/g, resolvedSubject);
            try { await sendSMS({ to: orderPhoneE164, message: smsBody }); } catch { /* best effort */ }
          }
        }

        sentCount++;
        if (sentCount % 5 === 0) await sleep(500);
      } catch (err) {
        console.error(`Failed to send registration link to ${order.parent1Email}:`, err.message);
        errorCount++;
      }
    }

    return res.status(200).json({ success: true, sentCount, errorCount, total: orders.length });
  } catch (error) {
    console.error("Bulk registration link error:", error);
    return res.status(500).json({ error: "Failed to send registration links" });
  }
}
export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  return _POST(req, res);
}
