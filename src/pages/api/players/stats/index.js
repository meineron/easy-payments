import mongoose from "mongoose";
import { getClubContext } from "@/lib/club-context";

async function _GET(req, res) {
  try {
    const { ctx, error } = await getClubContext(req, res);
    if (error) return res.status(200).json(error.body, { status: error.status });

    const clubOid = new mongoose.Types.ObjectId(String(ctx.clubId));

    const [result] = await ctx.models.Order.aggregate([
      {
        $match: {
          clubId: clubOid,
          status: { $nin: ["cancelled"] },
        },
      },
      {
        $group: {
          _id: null,
          expectedCents: { $sum: "$totalCostCents" },
          collectedCents: { $sum: "$paidCents" },
          orderCount: { $sum: 1 },
        },
      },
    ]);

    return res.status(200).json({
      expectedCents: result?.expectedCents || 0,
      collectedCents: result?.collectedCents || 0,
      uncollectedCents: (result?.expectedCents || 0) - (result?.collectedCents || 0),
      orderCount: result?.orderCount || 0,
    });
  } catch (error) {
    console.error("Player stats error:", error);
    return res.status(500).json({ error: "Failed to get stats" });
  }
}
export default async function handler(req, res) {
  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });
  return _GET(req, res);
}
