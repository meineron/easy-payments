import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import dbConnect from "@/lib/mongodb";
import Order from "@/models/Order";
import OrderLog from "@/models/OrderLog";

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

function formatCents(c) { return "$" + ((c || 0) / 100).toFixed(2); }

export async function POST(request, { params }) {
  try {
    const session = await getServerSession(authOptions);
    if (!session || session.user.role !== "club") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const { id } = await params;
    const body = await request.json();
    const { orderIds, action, item, discount } = body;

    if (!orderIds?.length || !action) {
      return NextResponse.json({ error: "orderIds and action are required" }, { status: 400 });
    }

    await dbConnect();
    const userName = session.user.name || session.user.username || "Admin";
    const orders = await Order.find({ _id: { $in: orderIds }, activityId: id, clubId: session.user.id });

    if (orders.length === 0) {
      return NextResponse.json({ error: "No matching orders found" }, { status: 404 });
    }

    const logs = [];
    const updatedIds = [];

    for (const order of orders) {
      if (action === "add_item" && item) {
        const newItem = {
          name: item.name || "Item",
          priceCents: item.priceCents || 0,
          quantity: item.quantity || 1,
          isDiscount: item.isDiscount || false,
          isManual: true,
        };
        const oldItems = JSON.stringify(order.items || []);
        order.items = [...(order.items || []), newItem];
        order.totalCostCents = computeTotal(order);
        await order.save();
        updatedIds.push(order._id);
        logs.push({
          orderId: order._id, activityId: id, clubId: session.user.id,
          userId: session.user.id, userName,
          field: "items",
          previousValue: oldItems,
          newValue: JSON.stringify(order.items),
          description: `Bulk: Added item "${newItem.name}" (${newItem.isDiscount ? "-" : ""}${formatCents(newItem.priceCents)})`,
        });
      } else if (action === "remove_item" && item?.name) {
        const oldItems = JSON.stringify(order.items || []);
        const filtered = (order.items || []).filter((i) => i.name !== item.name);
        if (filtered.length !== (order.items || []).length) {
          order.items = filtered;
          order.totalCostCents = computeTotal(order);
          await order.save();
          updatedIds.push(order._id);
          logs.push({
            orderId: order._id, activityId: id, clubId: session.user.id,
            userId: session.user.id, userName,
            field: "items",
            previousValue: oldItems,
            newValue: JSON.stringify(order.items),
            description: `Bulk: Removed item "${item.name}"`,
          });
        }
      } else if (action === "apply_discount" && discount) {
        const oldType = order.discountType || "none";
        const oldValue = order.discountValue || 0;
        order.discountType = discount.type || "amount";
        order.discountValue = discount.value || 0;
        order.totalCostCents = computeTotal(order);
        await order.save();
        updatedIds.push(order._id);
        logs.push({
          orderId: order._id, activityId: id, clubId: session.user.id,
          userId: session.user.id, userName,
          field: "discountType",
          previousValue: `${oldType}:${oldValue}`,
          newValue: `${order.discountType}:${order.discountValue}`,
          description: `Bulk: Discount set to ${discount.type === "percentage" ? discount.value + "%" : formatCents(discount.value)}`,
        });
      }
    }

    if (logs.length > 0) {
      await OrderLog.insertMany(logs);
    }

    const updated = await Order.find({ _id: { $in: updatedIds } })
      .populate("teamId", "name season gender")
      .lean();

    return NextResponse.json({ success: true, updated, count: updatedIds.length });
  } catch (error) {
    console.error("Bulk action error:", error);
    return NextResponse.json({ error: "Failed to perform bulk action" }, { status: 500 });
  }
}
