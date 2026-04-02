import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import dbConnect from "@/lib/mongodb";
import OrderLog from "@/models/OrderLog";

export async function GET(request, { params }) {
  try {
    const session = await getServerSession(authOptions);
    if (!session || session.user.role !== "club") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const { id } = await params;
    await dbConnect();

    const logs = await OrderLog.find({ activityId: id, clubId: session.user.id })
      .sort({ createdAt: -1 })
      .limit(200)
      .lean();

    return NextResponse.json({ logs });
  } catch (error) {
    console.error("Get activity logs error:", error);
    return NextResponse.json({ error: "Failed to get logs" }, { status: 500 });
  }
}
