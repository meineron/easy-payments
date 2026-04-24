import { NextResponse } from "next/server";
import dbConnect from "@/lib/mongodb";
import Order from "@/models/Order";
import { sendWaiverConfirmationPDFEmail } from "@/lib/waiver-confirmation-email";

/**
 * Sends the dedicated waiver-confirmation email for an order that already
 * has its waiver consents persisted (typically by the preceding /save call).
 *
 * The caller may also pass `waiverConsents` as a safety net — if any of them
 * aren't yet on the order we merge them in before generating the email.
 *
 * This endpoint is ONLY called from the ON (email-confirmation) path right
 * after a successful OTP verification, so we force the helper to resend even
 * when `waiverConfirmationSentAt` is already set. Otherwise a parent who
 * re-signs or returns via the same link would never see the email again,
 * which is the user-visible symptom we're fixing here.
 *
 * The OFF path (post-payment) uses the same helper from inside the Stripe
 * webhook / save route without `force`, so idempotency there is preserved.
 */
export async function POST(request, { params }) {
  try {
    const { activityId } = await params;
    const body = await request.json();
    const { token, orderId, waiverConsents = [] } = body;

    await dbConnect();

    let order;
    if (token) {
      order = await Order.findOne({ registrationToken: token, activityId });
    } else if (orderId) {
      order = await Order.findOne({ _id: orderId, activityId });
    }

    if (!order) {
      return NextResponse.json({ error: "Order not found" }, { status: 404 });
    }

    if (Array.isArray(waiverConsents) && waiverConsents.length > 0) {
      const existing = new Set(
        (order.waiverConsents || []).filter((c) => c.agreedAt).map((c) => c.waiverId),
      );
      const merged = [...(order.waiverConsents || [])];
      let mutated = false;
      for (const nc of waiverConsents) {
        if (!nc.agreedAt) continue;
        if (existing.has(nc.waiverId)) continue;
        const idx = merged.findIndex((c) => c.waiverId === nc.waiverId);
        if (idx >= 0) merged[idx] = nc;
        else merged.push(nc);
        mutated = true;
      }
      if (mutated) {
        order.waiverConsents = merged;
        await order.save();
      }
    }

    const result = await sendWaiverConfirmationPDFEmail(order, { force: true });

    return NextResponse.json({ ok: !!result?.ok, sentTo: result?.sentTo || [] });
  } catch (error) {
    console.error("Waiver confirmation error:", error);
    return NextResponse.json({ error: "Failed to send waiver confirmation" }, { status: 500 });
  }
}
