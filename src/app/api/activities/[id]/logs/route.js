import { NextResponse } from "next/server";
import { getClubContext } from "@/lib/club-context";

export async function GET(request, { params }) {
  try {
    const { ctx, error } = await getClubContext();
    if (error) return NextResponse.json(error.body, { status: error.status });

    const { id } = await params;

    const logs = await ctx.models.OrderLog.find({ activityId: id, clubId: ctx.clubId })
      .sort({ createdAt: -1 })
      .limit(200)
      .lean();

    return NextResponse.json({ logs });
  } catch (error) {
    console.error("Get activity logs error:", error);
    return NextResponse.json({ error: "Failed to get logs" }, { status: 500 });
  }
}
