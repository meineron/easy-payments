import crypto from "crypto";
import { connectMain } from "@/lib/mongodb";
import { getClubContext, dualCreate } from "@/lib/club-context";
import Club from "@/models/Club";
import { sendPaymentLink } from "@/lib/email";
import { sendSMS, toE164 } from "@/lib/sms";

async function _GET(req, res) {
  try {
    const { ctx, error } = await getClubContext(req, res);
    if (error) return res.status(200).json(error.body, { status: error.status });

    const { id, orderId } = req.query;

    const paymentRequests = await ctx.models.PaymentRequest.find({
      orderId,
      activityId: id,
      clubId: ctx.clubId,
    }).sort({ createdAt: -1 }).lean();

    return res.status(200).json({ paymentRequests });
  } catch (error) {
    console.error("Get payment requests error:", error);
    return res.status(500).json({ error: "Failed to get payment requests" });
  }
}

async function _POST(req, res) {
  try {
    const { ctx, error } = await getClubContext(req, res);
    if (error) return res.status(200).json(error.body, { status: error.status });
    const { Order, PaymentRequest, Activity } = ctx.models;

    const { id, orderId } = req.query;
    const body = req.body;
    const { items, sendMethod, recipientEmail, recipientName, note, allowedInstallments } = body;

    if (!items?.length) {
      return res.status(400).json({ error: "Select at least one item" });
    }

    const order = await Order.findOne({ _id: orderId, activityId: id, clubId: ctx.clubId }).lean();
    if (!order) {
      return res.status(404).json({ error: "Order not found" });
    }

    const totalCents = items.reduce((sum, i) => sum + (i.amountCents || 0), 0);
    if (totalCents <= 0) {
      return res.status(400).json({ error: "Total must be greater than zero" });
    }

    const outstandingRequests = await PaymentRequest.find({
      orderId, clubId: ctx.clubId, status: "pending",
    }).lean();
    const pendingTotal = outstandingRequests.reduce((s, r) => s + r.totalCents, 0);
    const outstandingBalance = order.totalCostCents - (order.paidCents || 0) - pendingTotal;

    if (totalCents > outstandingBalance) {
      return res.status(400).json({ error: "Total exceeds outstanding balance" });
    }

    let email = "";
    let name = "";
    let phone = "";
    const isSMS = sendMethod === "sms_parent1" || sendMethod === "sms_parent2";
    if (sendMethod === "parent1") {
      email = order.parent1Email || "";
      name = `${order.parent1FirstName} ${order.parent1LastName}`.trim();
    } else if (sendMethod === "parent2") {
      email = order.parent2Email || "";
      name = `${order.parent2FirstName} ${order.parent2LastName}`.trim();
    } else if (sendMethod === "sms_parent1") {
      phone = order.parent1Phone || "";
      name = `${order.parent1FirstName} ${order.parent1LastName}`.trim();
    } else if (sendMethod === "sms_parent2") {
      phone = order.parent2Phone || "";
      name = `${order.parent2FirstName} ${order.parent2LastName}`.trim();
    } else if (sendMethod === "custom") {
      email = recipientEmail || "";
      name = recipientName || "";
    }

    const paymentToken = crypto.randomUUID();
    const validInstallments = (Array.isArray(allowedInstallments) && allowedInstallments.length > 0)
      ? [...new Set(allowedInstallments.map(Number).filter((n) => n >= 1 && n <= 10))].sort((a, b) => a - b)
      : [1];

    const pr = await dualCreate(ctx, "PaymentRequest", {
      orderId,
      clubId: ctx.clubId,
      activityId: id,
      items,
      totalCents,
      status: "pending",
      recipientEmail: email,
      recipientName: name,
      sendMethod: sendMethod || "copy_only",
      paymentToken,
      allowedInstallments: validInstallments,
      note: note || "",
      sentAt: (sendMethod !== "copy_only" && (email || isSMS)) ? new Date() : null,
    });

    const baseUrl = process.env.NEXTAUTH_URL || "http://localhost:3000";
    const paymentUrl = `${baseUrl}/payment/request/${paymentToken}`;

    if (isSMS && phone) {
      try {
        const pfx = sendMethod === "sms_parent2" ? (order.parent2PhonePrefix || "+1") : (order.parent1PhonePrefix || "+1");
        const e164 = toE164(pfx, phone);
        if (e164) {
          const totalAmount = "$" + (totalCents / 100).toFixed(2);
          await sendSMS({ to: e164, message: `Payment of ${totalAmount} requested. Pay here: ${paymentUrl}` });
        }
      } catch (smsErr) {
        console.error("Failed to send payment request SMS:", smsErr.message);
      }
    } else if (sendMethod !== "copy_only" && email) {
      try {
        await connectMain();
        const [activity, club] = await Promise.all([
          Activity.findById(id, "title").lean(),
          Club.findById(ctx.clubId, "name logoUrl language").lean(),
        ]);
        const playerName = `${order.playerFirstName} ${order.playerLastName}`.trim();
        const totalAmount = "$" + (totalCents / 100).toFixed(2);

        await sendPaymentLink(email, {
          playerName,
          clubName: club?.name || "",
          activityTitle: activity?.title || "",
          paymentUrl,
          totalAmount,
          logoUrl: club?.logoUrl || null,
          locale: club?.language || "en",
        });
      } catch (emailErr) {
        console.error("Failed to send payment request email:", emailErr.message);
      }
    }

    return res.status(200).json({
      success: true,
      paymentRequest: pr.toObject ? pr.toObject() : pr,
      paymentUrl,
    }, { status: 201 });
  } catch (error) {
    console.error("Create payment request error:", error);
    return res.status(500).json({ error: "Failed to create payment request" });
  }
}
export default async function handler(req, res) {
  if (req.method === "GET") {
    return _GET(req, res);
  } else if (req.method === "POST") {
    return _POST(req, res);
  } else {
    return res.status(405).json({ error: "Method not allowed" });
  }
}
