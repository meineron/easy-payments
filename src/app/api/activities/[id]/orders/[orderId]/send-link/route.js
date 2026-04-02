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
    if (!order) {
      return NextResponse.json({ error: "Order not found" }, { status: 404 });
    }

    let token = order.registrationToken;
    if (!token || (order.registrationTokenExpiresAt && order.registrationTokenExpiresAt < new Date())) {
      token = crypto.randomUUID();
      order.registrationToken = token;
      order.registrationTokenExpiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
      await order.save();
    }

    const baseUrl = process.env.NEXTAUTH_URL || "http://localhost:3000";
    const registrationUrl = `${baseUrl}/register/${id}?token=${token}`;

    return NextResponse.json({ success: true, registrationUrl });
  } catch (error) {
    console.error("Generate registration link error:", error);
    return NextResponse.json({ error: "Failed to generate link" }, { status: 500 });
  }
}
