import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import dbConnect from "@/lib/mongodb";
import mongoose from "mongoose";
import Order from "@/models/Order";

export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session || session.user.role !== "club") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    await dbConnect();

    const clubOid = new mongoose.Types.ObjectId(String(session.user.id));

    const [result] = await Order.aggregate([
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
