import { NextResponse } from "next/server";
import dbConnect from "@/lib/mongodb";
import Order from "@/models/Order";
import { sendWaiverConfirmationPDFEmail } from "@/lib/waiver-confirmation-email";

/**
 * Sends the dedicated waiver-confirmation PDF email for an order that already
 * has its waiver consents persisted (typically by the preceding /save call).
 *
 * The caller may also pass `waiverConsents` as a safety net — if any of them
 * aren't yet on the order we merge them in before generating the PDF.
 *
 * Idempotent: the underlying helper no-ops when `order.waiverConfirmationSentAt`
 * is already set, so duplicate calls (e.g. client retries) are safe.
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

    await sendWaiverConfirmationPDFEmail(order);

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Waiver confirmation error:", error);
    return NextResponse.json({ error: "Failed to send waiver confirmation" }, { status: 500 });
  }
}
