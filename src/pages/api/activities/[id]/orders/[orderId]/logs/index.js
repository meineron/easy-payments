import { getClubContext, dualCreate } from "@/lib/club-context";

async function _GET(req, res) {
  try {
    const { ctx, error } = await getClubContext(req, res);
    if (error) return res.status(200).json(error.body, { status: error.status });

    const { orderId } = req.query;

    const logs = await ctx.models.OrderLog.find({ orderId, clubId: ctx.clubId })
      .sort({ createdAt: -1 })
      .lean();

    return res.status(200).json({ logs });
  } catch (error) {
    console.error("Get order logs error:", error);
    return res.status(500).json({ error: "Failed to get logs" });
  }
}

async function _POST(req, res) {
  try {
    const { session, ctx, error } = await getClubContext(req, res);
    if (error) return res.status(200).json(error.body, { status: error.status });
    const { Order } = ctx.models;

    const { id, orderId } = req.query;
    const body = req.body;
    const content = (body?.content || "").trim();
    if (!content) {
      return res.status(400).json({ error: "Content is required" });
    }

    const order = await Order.findOne({
      _id: orderId,
      activityId: id,
      clubId: ctx.clubId,
    }).select("_id").lean();
    if (!order) {
      return res.status(404).json({ error: "Order not found" });
    }

    const log = await dualCreate(ctx, "OrderLog", {
      orderId,
      activityId: id,
      clubId: ctx.clubId,
      userId: session.user.userId || session.user.id,
      userName: session.user.name || "",
      field: "comment",
      previousValue: "",
      newValue: "",
      description: content,
    });

    return res.status(200).json({ log: log.toObject ? log.toObject() : log });
  } catch (error) {
    console.error("Post order log error:", error);
    return res.status(500).json({ error: "Failed to post comment" });
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
