import { NextResponse } from "next/server";
import { resolvePublicContext, dualSave } from "@/lib/club-context";
import { sendWaiverConfirmationPDFEmail } from "@/lib/waiver-confirmation-email";

export async function POST(request, { params }) {
  try {
    const { activityId } = await params;
    const body = await request.json();
    const { token, orderId, waiverConsents = [] } = body;

    const ctx = await resolvePublicContext("activity", activityId);
    if (!ctx) {
      return NextResponse.json({ error: "Activity not found" }, { status: 404 });
    }
    const { Order } = ctx.models;

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
        await dualSave(ctx, order);
      }
    }

    const result = await sendWaiverConfirmationPDFEmail(order, { force: true, ctx });

    return NextResponse.json({ ok: !!result?.ok, sentTo: result?.sentTo || [] });
  } catch (error) {
    console.error("Waiver confirmation error:", error);
    return NextResponse.json({ error: "Failed to send waiver confirmation" }, { status: 500 });
  }
}
