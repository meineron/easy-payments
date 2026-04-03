import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import dbConnect from "@/lib/mongodb";
import Order from "@/models/Order";
import crypto from "crypto";

export async function POST(request, { params }) {
  try {
    const session = await getServerSession(authOptions);
    if (!session || session.user.role !== "club") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const { id, orderId } = await params;
    await dbConnect();

    const order = await Order.findOne({ _id: orderId, activityId: id, clubId: session.user.id });
    if (!order) return NextResponse.json({ error: "Order not found" }, { status: 404 });
    if (order.status === "paid") return NextResponse.json({ error: "Already paid" }, { status: 400 });

    if (!order.paymentToken) {
      order.paymentToken = crypto.randomUUID();
    }
    order.paymentLinkSentAt = new Date();
    await order.save();

    const baseUrl = process.env.NEXTAUTH_URL || "http://localhost:3000";
    const paymentUrl = `${baseUrl}/payment/${order.paymentToken}`;

    return NextResponse.json({ success: true, paymentUrl, paymentLinkSentAt: order.paymentLinkSentAt });
  } catch (error) {
    console.error("Send payment link error:", error);
    return NextResponse.json({ error: "Failed to send payment link" }, { status: 500 });
  }
}
