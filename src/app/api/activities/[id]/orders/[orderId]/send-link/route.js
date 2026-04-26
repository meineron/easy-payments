import { NextResponse } from "next/server";
import crypto from "crypto";
import { getClubContext, dualSave } from "@/lib/club-context";

export async function POST(request, { params }) {
  try {
    const { ctx, error } = await getClubContext();
    if (error) return NextResponse.json(error.body, { status: error.status });
    const { Order } = ctx.models;

    const { id, orderId } = await params;

    const order = await Order.findOne({ _id: orderId, activityId: id, clubId: ctx.clubId });
    if (!order) {
      return NextResponse.json({ error: "Order not found" }, { status: 404 });
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

    return NextResponse.json({ success: true, registrationUrl });
  } catch (error) {
    console.error("Generate registration link error:", error);
    return NextResponse.json({ error: "Failed to generate link" }, { status: 500 });
  }
}
