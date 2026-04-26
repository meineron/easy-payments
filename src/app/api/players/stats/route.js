import { NextResponse } from "next/server";
import mongoose from "mongoose";
import { getClubContext } from "@/lib/club-context";

export async function GET() {
  try {
    const { ctx, error } = await getClubContext();
    if (error) return NextResponse.json(error.body, { status: error.status });

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

    return NextResponse.json({
      expectedCents: result?.expectedCents || 0,
      collectedCents: result?.collectedCents || 0,
      uncollectedCents: (result?.expectedCents || 0) - (result?.collectedCents || 0),
      orderCount: result?.orderCount || 0,
    });
  } catch (error) {
    console.error("Player stats error:", error);
    return NextResponse.json({ error: "Failed to get stats" }, { status: 500 });
  }
}
