import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import dbConnect from "@/lib/mongodb";
import PaymentRequest from "@/models/PaymentRequest";
import Activity from "@/models/Activity";
import Club from "@/models/Club";
import Order from "@/models/Order";
import { sendPaymentLink } from "@/lib/email";

export async function POST(request, { params }) {
  try {
    const session = await getServerSession(authOptions);
    if (!session || session.user.role !== "club") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const { id, orderId, requestId } = await params;
    await dbConnect();

    const pr = await PaymentRequest.findOne({
      _id: requestId, orderId, activityId: id, clubId: session.user.id,
    });
    if (!pr) {
      return NextResponse.json({ error: "Payment request not found" }, { status: 404 });
    }
    if (pr.status !== "pending") {
      return NextResponse.json({ error: "Can only resend pending requests" }, { status: 400 });
    }
    if (!pr.recipientEmail) {
      return NextResponse.json({ error: "No recipient email on this request" }, { status: 400 });
    }

    const [order, activity, club] = await Promise.all([
      Order.findById(orderId, "playerFirstName playerLastName").lean(),
      Activity.findById(id, "title").lean(),
      Club.findById(session.user.id, "name logoUrl language").lean(),
    ]);

    const baseUrl = process.env.NEXTAUTH_URL || "http://localhost:3000";
    const paymentUrl = `${baseUrl}/payment/request/${pr.paymentToken}`;
    const playerName = order ? `${order.playerFirstName} ${order.playerLastName}`.trim() : "";
    const totalAmount = "$" + (pr.totalCents / 100).toFixed(2);

    await sendPaymentLink(pr.recipientEmail, {
      playerName,
      clubName: club?.name || "",
      activityTitle: activity?.title || "",
      paymentUrl,
      totalAmount,
      logoUrl: club?.logoUrl || null,
      locale: club?.language || "en",
    });

    pr.sentAt = new Date();
    await pr.save();

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Resend payment request error:", error);
    return NextResponse.json({ error: "Failed to resend payment request" }, { status: 500 });
  }
}
