import { resolvePublicContext } from "@/lib/club-context";

async function _POST(req, res) {
  try {
    const { activityId } = req.query;
    const { code, totalBeforeCoupon } = req.body;

    if (!code) {
      return res.status(400).json({ error: "Coupon code is required" });
    }

    const ctx = await resolvePublicContext("activity", activityId);
    if (!ctx) {
      return res.status(404).json({ error: "Activity not found" });
    }
    const activity = await ctx.models.Activity.findById(activityId, "coupons").lean();
    if (!activity) {
      return res.status(404).json({ error: "Activity not found" });
    }

    const coupon = (activity.coupons || []).find(
      (c) => c.code.toLowerCase().trim() === code.toLowerCase().trim()
    );

    if (!coupon) {
      return res.status(400).json({ error: "Invalid coupon code" });
    }

    if (coupon.expiresAt && new Date() > new Date(coupon.expiresAt)) {
      return res.status(400).json({ error: "Coupon has expired" });
    }

    if (coupon.duration === "one_time" && coupon.usedCount >= 1) {
      return res.status(400).json({ error: "Coupon has already been used" });
    }
    if (coupon.duration === "x_times" && coupon.maxUses && coupon.usedCount >= coupon.maxUses) {
      return res.status(400).json({ error: "Coupon usage limit reached" });
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

    return res.status(200).json({
      valid: true,
      couponName: coupon.name,
      couponCode: coupon.code,
      discountCents,
      type: coupon.type,
      amount: coupon.amount,
    });
  } catch (error) {
    console.error("Apply coupon error:", error);
    return res.status(500).json({ error: "Failed to apply coupon" });
  }
}
export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  return _POST(req, res);
}
