import { NextResponse } from "next/server";
import { resolvePublicContext } from "@/lib/club-context";

export async function POST(request, { params }) {
  try {
    const { activityId } = await params;
    const { code, totalBeforeCoupon } = await request.json();

    if (!code) {
      return NextResponse.json({ error: "Coupon code is required" }, { status: 400 });
    }

    const ctx = await resolvePublicContext("activity", activityId);
    if (!ctx) {
      return NextResponse.json({ error: "Activity not found" }, { status: 404 });
    }
    const activity = await ctx.models.Activity.findById(activityId, "coupons").lean();
    if (!activity) {
      return NextResponse.json({ error: "Activity not found" }, { status: 404 });
    }

    const coupon = (activity.coupons || []).find(
      (c) => c.code.toLowerCase().trim() === code.toLowerCase().trim()
    );

    if (!coupon) {
      return NextResponse.json({ error: "Invalid coupon code" }, { status: 400 });
    }

    if (coupon.expiresAt && new Date() > new Date(coupon.expiresAt)) {
      return NextResponse.json({ error: "Coupon has expired" }, { status: 400 });
    }

    if (coupon.duration === "one_time" && coupon.usedCount >= 1) {
      return NextResponse.json({ error: "Coupon has already been used" }, { status: 400 });
    }
    if (coupon.duration === "x_times" && coupon.maxUses && coupon.usedCount >= coupon.maxUses) {
      return NextResponse.json({ error: "Coupon usage limit reached" }, { status: 400 });
    }

    let discountCents = 0;
    const total = totalBeforeCoupon || 0;

    if (coupon.type === "fixed") {
      discountCents = coupon.amount || 0;
    } else if (coupon.type === "percentage") {
      discountCents = Math.round(total * (coupon.amount || 0) / 100);
    } else if (coupon.type === "greater_than") {
      if (total > (coupon.amount || 0)) {
        discountCents = total - (coupon.amount || 0);
      }
    }

    discountCents = Math.min(discountCents, total);

    return NextResponse.json({
      valid: true,
      couponName: coupon.name,
      couponCode: coupon.code,
      discountCents,
      type: coupon.type,
      amount: coupon.amount,
    });
  } catch (error) {
    console.error("Apply coupon error:", error);
    return NextResponse.json({ error: "Failed to apply coupon" }, { status: 500 });
  }
}
