import { NextResponse } from "next/server";
import dbConnect from "@/lib/mongodb";
import Order from "@/models/Order";
import Activity from "@/models/Activity";
import Club from "@/models/Club";

export async function GET(request, { params }) {
  try {
    const { token } = await params;
    await dbConnect();

    const order = await Order.findOne({ paymentToken: token })
      .populate("teamId", "name season")
      .lean();

    if (!order) {
      return NextResponse.json({ error: "Payment link not found or expired" }, { status: 404 });
    }

    if (order.status === "paid") {
      return NextResponse.json({ error: "Already paid", paid: true }, { status: 400 });
    }

    const [activity, club] = await Promise.all([
      Activity.findById(order.activityId, "title description subscriptions startDate hasPayment waivers passStripeFeeToCustomer").lean(),
      Club.findById(order.clubId, "name logoUrl language").lean(),
    ]);

    const actSub = (activity?.subscriptions || []).find((s) => String(s._id) === order.subscriptionId);
    const maxInstallments = actSub?.maxInstallments || 1;
    const dueDateAmountCents = actSub?.dueDateAmountCents || order.totalCostCents;
    const firstInstallmentDate = actSub?.firstInstallmentDate || null;

    const regularItems = (order.items || []).filter((i) => !i.isDiscount);
    const discountItems = (order.items || []).filter((i) => i.isDiscount);

    return NextResponse.json({
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
      waivers: (activity?.waivers || []).map((w) => ({
        _id: w._id, title: w.title, contentHtml: w.contentHtml, isRequired: w.isRequired,
      })),
      existingConsents: (order.waiverConsents || []).map((c) => c.waiverId),
    });
  } catch (error) {
    console.error("Get payment details error:", error);
    return NextResponse.json({ error: "Failed to load payment details" }, { status: 500 });
  }
}
