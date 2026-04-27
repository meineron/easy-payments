import crypto from "crypto";
import { connectMain } from "@/lib/mongodb";
import { getClubContext, dualSave } from "@/lib/club-context";
import Club from "@/models/Club";
import { sendPaymentLink as sendPaymentLinkEmail } from "@/lib/email";
import { sendSMS, toE164 } from "@/lib/sms";

function formatCents(c) { return "$" + ((c || 0) / 100).toFixed(2); }

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

    const order = await Order.findOne({ _id: orderId, activityId: id, clubId: ctx.clubId });
    if (!order) return res.status(404).json({ error: "Order not found" });
    if (order.status === "paid") return res.status(400).json({ error: "Already paid" });

    let body = {};
    try { body = req.body; } catch { /* empty body ok */ }

    const recipients = body.recipients || [];
    const { channel } = body;
    const willSend = recipients.length > 0 || channel === "sms" || channel === "email";

    let tokenChanged = false;
    if (!order.paymentToken) {
      order.paymentToken = crypto.randomUUID();
      tokenChanged = true;
    }
    if (willSend) order.paymentLinkSentAt = new Date();
    if (tokenChanged || willSend) await dualSave(ctx, order);

    const baseUrl = process.env.NEXTAUTH_URL || "http://localhost:3000";
    const paymentUrl = `${baseUrl}/payment/${order.paymentToken}`;
    const totalDue = order.totalCostCents - (order.paidCents || 0);

    if (recipients.length > 0) {
      await connectMain();
      const [activity, club] = await Promise.all([
        Activity.findById(id, "title").lean(),
        Club.findById(ctx.clubId, "name logoUrl language").lean(),
      ]);
      const results = { sent: 0, failed: 0, errors: [] };

      for (const r of recipients) {
        const contact = getContactForTarget(order, r.target);
        try {
          if (r.channel === "sms") {
            if (!contact.phone) { results.failed++; results.errors.push(`No phone for ${r.target}`); continue; }
            const smsBody = body.bodyText || `Payment of ${formatCents(totalDue > 0 ? totalDue : order.totalCostCents)} requested. Pay here: ${paymentUrl}`;
            await sendSMS({ to: contact.phone, message: smsBody });
            results.sent++;
          } else if (r.channel === "email") {
            if (!contact.email) { results.failed++; results.errors.push(`No email for ${r.target}`); continue; }
            await sendPaymentLinkEmail(contact.email, {
              playerName: `${order.playerFirstName} ${order.playerLastName}`,
              clubName: club?.name || "",
              activityTitle: activity?.title || "",
              paymentUrl,
              totalAmount: formatCents(totalDue > 0 ? totalDue : order.totalCostCents),
              logoUrl: club?.logoUrl || null,
              locale: club?.language || "en",
            });
            results.sent++;
          }
        } catch (err) {
          results.failed++;
          results.errors.push(`${r.target} ${r.channel}: ${err.message}`);
        }
      }

      return res.status(200).json({ success: true, paymentUrl, paymentLinkSentAt: order.paymentLinkSentAt, results });
    }

    if (channel === "sms") {
      const phone = toE164(order.parent1PhonePrefix || "+1", order.parent1Phone);
      if (!phone) return res.status(400).json({ error: "No phone number" });
      const smsBody = body.bodyText || `Payment of ${formatCents(totalDue > 0 ? totalDue : order.totalCostCents)} requested. Pay here: ${paymentUrl}`;
      await sendSMS({ to: phone, message: smsBody });
    } else if (channel === "email") {
      if (!order.parent1Email) return res.status(400).json({ error: "No email address" });

      await connectMain();
      const [activity, club] = await Promise.all([
        Activity.findById(id, "title").lean(),
        Club.findById(ctx.clubId, "name logoUrl language").lean(),
      ]);

      await sendPaymentLinkEmail(order.parent1Email, {
        playerName: `${order.playerFirstName} ${order.playerLastName}`,
        clubName: club?.name || "",
        activityTitle: activity?.title || "",
        paymentUrl,
        totalAmount: formatCents(totalDue > 0 ? totalDue : order.totalCostCents),
        logoUrl: club?.logoUrl || null,
        locale: club?.language || "en",
      });
    }

    return res.status(200).json({ success: true, paymentUrl, paymentLinkSentAt: order.paymentLinkSentAt });
  } catch (error) {
    console.error("Send payment link error:", error);
    return res.status(500).json({ error: "Failed to send payment link" });
  }
}
export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  return _POST(req, res);
}
