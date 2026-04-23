import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import dbConnect from "@/lib/mongodb";
import Order from "@/models/Order";
import { sendWaiverConfirmationPDFEmail } from "@/lib/waiver-confirmation-email";

export async function POST(_request, { params }) {
  try {
    const session = await getServerSession(authOptions);
    if (!session || session.user.role !== "club") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id, orderId } = await params;
    await dbConnect();

    const order = await Order.findOne({ _id: orderId, activityId: id, clubId: session.user.id });
    if (!order) return NextResponse.json({ error: "Order not found" }, { status: 404 });

    const signed = (order.waiverConsents || []).filter((c) => c.agreedAt);
    if (signed.length === 0) {
      return NextResponse.json({ error: "No signed waivers on this order" }, { status: 400 });
    }

    // `force: true` — admin explicitly asked for a resend, so bypass the
    // `waiverConfirmationSentAt` idempotency guard.
    const result = await sendWaiverConfirmationPDFEmail(order, { force: true });
    if (!result.ok) {
      return NextResponse.json({ error: result.reason || "Failed to send" }, { status: 500 });
    }

    return NextResponse.json({ success: true, sentTo: result.sentTo || [] });
  } catch (error) {
    console.error("Send waivers confirmation email error:", error);
    return NextResponse.json({ error: "Failed to send waivers email" }, { status: 500 });
  }
}
