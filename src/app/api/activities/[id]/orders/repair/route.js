import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import dbConnect from "@/lib/mongodb";
import Order from "@/models/Order";
import Activity from "@/models/Activity";

function computeTotal(order) {
  let total = order.subscriptionPriceCents || 0;
  (order.items || []).forEach((item) => {
    const amt = (item.priceCents || 0) * (item.quantity || 1);
    if (item.isDiscount) total -= amt; else total += amt;
  });
  if (order.discountType === "amount") total -= order.discountValue || 0;
  else if (order.discountType === "percentage") total -= Math.round(total * (order.discountValue || 0) / 100);
  total -= order.couponDiscountCents || 0;
  return Math.max(0, total);
}

export async function POST(request, { params }) {
  try {
    const session = await getServerSession(authOptions);
    if (!session || session.user.role !== "club") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const { id } = await params;
    await dbConnect();

    const activity = await Activity.findOne({ _id: id, clubId: session.user.id }).lean();
    if (!activity) {
      return NextResponse.json({ error: "Activity not found" }, { status: 404 });
    }

    const subscriptions = activity.subscriptions || [];
    const now = new Date();

    const orders = await Order.find({
      activityId: id,
      clubId: session.user.id,
      status: { $ne: "paid" },
    });

    let repaired = 0;

    for (const order of orders) {
      const sub = subscriptions.find((s) => String(s._id) === order.subscriptionId);
      if (!sub) continue;

      const activeItems = (sub.items || []).filter((item) =>
        !item.expiresAt || new Date(item.expiresAt) >= now
      );

      if (activeItems.length === 0) continue;

      const orderHasItems = (order.items || []).length > 0;
      if (orderHasItems) continue;

      order.items = activeItems.map((item) => ({
        name: item.name,
        priceCents: item.priceCents,
        quantity: item.quantity,
        isRequired: item.isRequired,
        isDiscount: item.isDiscount || false,
      }));

      if (!order.subscriptionPriceCents && sub.priceCents) {
        order.subscriptionPriceCents = sub.priceCents;
        order.subscriptionTitle = sub.title;
      }

      order.totalCostCents = computeTotal(order);
      await order.save();
      repaired++;
    }

    return NextResponse.json({ success: true, repaired, total: orders.length });
  } catch (error) {
    console.error("Repair orders error:", error);
    return NextResponse.json({ error: "Failed to repair orders" }, { status: 500 });
  }
}
