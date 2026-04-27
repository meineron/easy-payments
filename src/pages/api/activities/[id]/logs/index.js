import { getClubContext } from "@/lib/club-context";

async function _GET(req, res) {
  try {
    const { ctx, error } = await getClubContext(req, res);
    if (error) return res.status(200).json(error.body, { status: error.status });

    const { id } = req.query;

    const logs = await ctx.models.OrderLog.find({ activityId: id, clubId: ctx.clubId })
      .sort({ createdAt: -1 })
      .limit(200)
      .lean();

    return res.status(200).json({ logs });
  } catch (error) {
    console.error("Get activity logs error:", error);
    return res.status(500).json({ error: "Failed to get logs" });
  }
}
export default async function handler(req, res) {
  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });
  return _GET(req, res);
}
