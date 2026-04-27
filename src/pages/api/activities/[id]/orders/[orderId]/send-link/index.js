import crypto from "crypto";
import { getClubContext, dualSave } from "@/lib/club-context";

async function _POST(req, res) {
  try {
    const { ctx, error } = await getClubContext(req, res);
    if (error) return res.status(200).json(error.body, { status: error.status });
    const { Order } = ctx.models;

    const { id, orderId } = req.query;

    const order = await Order.findOne({ _id: orderId, activityId: id, clubId: ctx.clubId });
    if (!order) {
      return res.status(404).json({ error: "Order not found" });
    }

    let token = order.registrationToken;
    if (!token || (order.registrationTokenExpiresAt && order.registrationTokenExpiresAt < new Date())) {
      token = crypto.randomUUID();
      order.registrationToken = token;
      order.registrationTokenExpiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
      await dualSave(ctx, order);
    }

    const baseUrl = process.env.NEXTAUTH_URL || "http://localhost:3000";
    const registrationUrl = `${baseUrl}/register/${id}?token=${token}`;

    return res.status(200).json({ success: true, registrationUrl });
  } catch (error) {
    console.error("Generate registration link error:", error);
    return res.status(500).json({ error: "Failed to generate link" });
  }
}
export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  return _POST(req, res);
}
