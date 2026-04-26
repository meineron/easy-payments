import { NextResponse } from "next/server";
import { connectMain } from "@/lib/mongodb";
import { getClubContext, dualSave } from "@/lib/club-context";
import Club from "@/models/Club";
import { sendPaymentLink } from "@/lib/email";

export async function POST(request, { params }) {
  try {
    const { ctx, error } = await getClubContext();
    if (error) return NextResponse.json(error.body, { status: error.status });
    const { PaymentRequest, Activity, Order } = ctx.models;

    const { id, orderId, requestId } = await params;

    const pr = await PaymentRequest.findOne({
      _id: requestId, orderId, activityId: id, clubId: ctx.clubId,
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

    await connectMain();
    const [order, activity, club] = await Promise.all([
      Order.findById(orderId, "playerFirstName playerLastName").lean(),
      Activity.findById(id, "title").lean(),
      Club.findById(ctx.clubId, "name logoUrl language").lean(),
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
    await dualSave(ctx, pr);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Resend payment request error:", error);
    return NextResponse.json({ error: "Failed to resend payment request" }, { status: 500 });
  }
}
