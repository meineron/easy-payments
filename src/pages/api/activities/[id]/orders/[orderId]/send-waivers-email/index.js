import { getClubContext } from "@/lib/club-context";
import { sendWaiverConfirmationPDFEmail } from "@/lib/waiver-confirmation-email";

async function _POST(req, res) {
  try {
    const { ctx, error } = await getClubContext(req, res);
    if (error) return res.status(200).json(error.body, { status: error.status });
    const { Order } = ctx.models;

    const { id, orderId } = req.query;

    const order = await Order.findOne({ _id: orderId, activityId: id, clubId: ctx.clubId });
    if (!order) return res.status(404).json({ error: "Order not found" });

    const signed = (order.waiverConsents || []).filter((c) => c.agreedAt);
    if (signed.length === 0) {
      return res.status(400).json({ error: "No signed waivers on this order" });
    }

    const result = await sendWaiverConfirmationPDFEmail(order, { force: true, ctx });
    if (!result.ok) {
      return res.status(500).json({ error: result.reason || "Failed to send" });
    }

    return res.status(200).json({ success: true, sentTo: result.sentTo || [] });
  } catch (error) {
    console.error("Send waivers confirmation email error:", error);
    return res.status(500).json({ error: "Failed to send waivers email" });
  }
}
export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  return _POST(req, res);
}
