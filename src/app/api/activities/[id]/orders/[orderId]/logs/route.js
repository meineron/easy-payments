import { NextResponse } from "next/server";
import { getClubContext, dualCreate } from "@/lib/club-context";

export async function GET(request, { params }) {
  try {
    const { ctx, error } = await getClubContext();
    if (error) return NextResponse.json(error.body, { status: error.status });

    const { orderId } = await params;

    const logs = await ctx.models.OrderLog.find({ orderId, clubId: ctx.clubId })
      .sort({ createdAt: -1 })
      .lean();

    return NextResponse.json({ logs });
  } catch (error) {
    console.error("Get order logs error:", error);
    return NextResponse.json({ error: "Failed to get logs" }, { status: 500 });
  }
}

export async function POST(request, { params }) {
  try {
    const { session, ctx, error } = await getClubContext();
    if (error) return NextResponse.json(error.body, { status: error.status });
    const { Order } = ctx.models;

    const { id, orderId } = await params;
    const body = await request.json();
    const content = (body?.content || "").trim();
    if (!content) {
      return NextResponse.json({ error: "Content is required" }, { status: 400 });
    }

    const order = await Order.findOne({
      _id: orderId,
      activityId: id,
      clubId: ctx.clubId,
    }).select("_id").lean();
    if (!order) {
      return NextResponse.json({ error: "Order not found" }, { status: 404 });
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

    return NextResponse.json({ log: log.toObject ? log.toObject() : log });
  } catch (error) {
    console.error("Post order log error:", error);
    return NextResponse.json({ error: "Failed to post comment" }, { status: 500 });
  }
}
