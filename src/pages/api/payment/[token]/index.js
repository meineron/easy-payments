import { connectMain } from "@/lib/mongodb";
import { resolvePublicContext } from "@/lib/club-context";
import Club from "@/models/Club";

export const dynamic = "force-dynamic";
export const revalidate = 0;

async function _GET(req, res) {
  try {
    const { token } = req.query;

    const ctx = await resolvePublicContext("paymentToken", token);
    if (!ctx) {
      return res.status(404).json({ error: "Payment link not found or expired" });
    }
    const { Order, Activity } = ctx.models;

    const order = await Order.findOne({ paymentToken: token })
      .populate("teamId", "name season")
      .lean();

    if (!order) {
      return res.status(404).json({ error: "Payment link not found or expired" });
    }

    if (order.status === "paid") {
      return res.status(200).json({ error: "Already paid", paid: true }, { status: 400 });
    }

    await connectMain();
    const [activity, club] = await Promise.all([
      Activity.findById(order.activityId, "title description subscriptions startDate hasPayment passStripeFeeToCustomer").lean(),
      Club.findById(order.clubId, "name logoUrl language").lean(),
    ]);

    const actSub = (activity?.subscriptions || []).find((s) => String(s._id) === order.subscriptionId);
    const maxInstallments = actSub?.maxInstallments || 1;
    const overrideDue = order.dueDateAmountCents || 0;
    const dueDateAmountCents = overrideDue > 0
      ? Math.min(overrideDue, order.totalCostCents)
      : (actSub?.dueDateAmountCents || order.totalCostCents);
    const firstInstallmentDate = actSub?.firstInstallmentDate || null;

    const regularItems = (order.items || []).filter((i) => !i.isDiscount);
    const discountItems = (order.items || []).filter((i) => i.isDiscount);

    return res.status(200).json(
      {
        order: {
          _id: order._id,
          playerFirstName: order.playerFirstName,
          playerLastName: order.playerLastName,
          subscriptionTitle: order.subscriptionTitle,
          subscriptionPriceCents: order.subscriptionPriceCents,
          items: regularItems,
          discountItems,
          discountType: order.discountType,
          discountValue: order.discountValue,
          couponCode: order.couponCode,
          couponDiscountCents: order.couponDiscountCents,
          totalCostCents: order.totalCostCents,
          paidCents: order.paidCents,
          status: order.status,
          teamName: order.teamId?.name || "",
        },
        activity: {
          _id: activity?._id,
          title: activity?.title || "",
        },
        club: {
          name: club?.name || "",
          logoUrl: club?.logoUrl || null,
          language: club?.language || "en",
          passStripeFeeToCustomer: !!activity?.passStripeFeeToCustomer,
        },
        installmentOptions: {
          maxInstallments,
          dueDateAmountCents,
          firstInstallmentDate,
          installmentFeeThreshold: actSub?.installmentFeeThreshold || 0,
          installmentFeePercent: actSub?.installmentFeePercent || 0,
          installmentFeeMode: actSub?.installmentFeeMode || "split",
        },
      },
      {
        headers: {
          "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
          Pragma: "no-cache",
          Expires: "0",
        },
      },
    );
  } catch (error) {
    console.error("Get payment details error:", error);
    return res.status(500).json({ error: "Failed to load payment details" });
  }
}
export default async function handler(req, res) {
  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });
  return _GET(req, res);
}
