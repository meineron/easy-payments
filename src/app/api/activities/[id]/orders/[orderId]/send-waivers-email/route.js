import { NextResponse } from "next/server";
import { getClubContext } from "@/lib/club-context";
import { sendWaiverConfirmationPDFEmail } from "@/lib/waiver-confirmation-email";

export async function POST(_request, { params }) {
  try {
    const { ctx, error } = await getClubContext();
    if (error) return NextResponse.json(error.body, { status: error.status });
    const { Order } = ctx.models;

    const { id, orderId } = await params;

    const order = await Order.findOne({ _id: orderId, activityId: id, clubId: ctx.clubId });
    if (!order) return NextResponse.json({ error: "Order not found" }, { status: 404 });

    const signed = (order.waiverConsents || []).filter((c) => c.agreedAt);
    if (signed.length === 0) {
      return NextResponse.json({ error: "No signed waivers on this order" }, { status: 400 });
    }

    const result = await sendWaiverConfirmationPDFEmail(order, { force: true, ctx });
    if (!result.ok) {
      return NextResponse.json({ error: result.reason || "Failed to send" }, { status: 500 });
    }

    return NextResponse.json({ success: true, sentTo: result.sentTo || [] });
  } catch (error) {
    console.error("Send waivers confirmation email error:", error);
    return NextResponse.json({ error: "Failed to send waivers email" }, { status: 500 });
  }
}
