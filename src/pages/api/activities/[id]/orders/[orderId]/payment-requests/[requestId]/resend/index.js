import { connectMain } from "@/lib/mongodb";
import { getClubContext, dualSave } from "@/lib/club-context";
import Club from "@/models/Club";
import { sendPaymentLink } from "@/lib/email";

async function _POST(req, res) {
  try {
    const { ctx, error } = await getClubContext(req, res);
    if (error) return res.status(200).json(error.body, { status: error.status });
    const { PaymentRequest, Activity, Order } = ctx.models;

    const { id, orderId, requestId } = req.query;

    const pr = await PaymentRequest.findOne({
      _id: requestId, orderId, activityId: id, clubId: ctx.clubId,
    });
    if (!pr) {
      return res.status(404).json({ error: "Payment request not found" });
    }
    if (pr.status !== "pending") {
      return res.status(400).json({ error: "Can only resend pending requests" });
    }
    if (!pr.recipientEmail) {
      return res.status(400).json({ error: "No recipient email on this request" });
    }

    await connectMain();
    const [order, activity, club] = await Promise.all([
      Order.findById(orderId, "playerFirstName playerLastName").lean(),
      Activity.findById(id, "title").lean(),
      Club.findById(ctx.clubId, "name logoUrl language").lean(),
    ]);

    const baseUrl = process.env.NEXTAUTH_URL || "http://localhost:3000";
    const paymentUrl = `${baseUrl}/payment/request/${pr.paymentToken}`;
    const playerName = order ? `${order.playerFirstName} ${order.playerLastName}`.trim() : "";
    const totalAmount = "$" + (pr.totalCents / 100).toFixed(2);

    await sendPaymentLink(pr.recipientEmail, {
      playerName,
      clubName: club?.name || "",
      activityTitle: activity?.title || "",
      paymentUrl,
      totalAmount,
      logoUrl: club?.logoUrl || null,
      locale: club?.language || "en",
    });

    pr.sentAt = new Date();
    await dualSave(ctx, pr);

    return res.status(200).json({ success: true });
  } catch (error) {
    console.error("Resend payment request error:", error);
    return res.status(500).json({ error: "Failed to resend payment request" });
  }
}
export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  return _POST(req, res);
}
