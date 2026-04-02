import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import dbConnect from "@/lib/mongodb";
import Order from "@/models/Order";
import OrderLog from "@/models/OrderLog";

function computeTotal(order) {
  let total = order.subscriptionPriceCents || 0;
  (order.items || []).forEach((item) => {
    total += (item.priceCents || 0) * (item.quantity || 1);
  });
  if (order.discountType === "amount") {
    total -= order.discountValue || 0;
  } else if (order.discountType === "percentage") {
    total -= Math.round(total * (order.discountValue || 0) / 100);
  }
  total -= order.couponDiscountCents || 0;
  return Math.max(0, total);
}

function formatCents(c) {
  return "$" + (c / 100).toFixed(2);
}

export async function GET(request, { params }) {
  try {
    const session = await getServerSession(authOptions);
    if (!session || session.user.role !== "club") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const { id, orderId } = await params;
    await dbConnect();

    const order = await Order.findOne({ _id: orderId, activityId: id, clubId: session.user.id })
      .populate("teamId", "name season gender")
      .lean();

    if (!order) {
      return NextResponse.json({ error: "Order not found" }, { status: 404 });
    }

    const logs = await OrderLog.find({ orderId })
      .sort({ createdAt: -1 })
      .lean();

    return NextResponse.json({ order, logs });
  } catch (error) {
    console.error("Get order error:", error);
    return NextResponse.json({ error: "Failed to get order" }, { status: 500 });
  }
}

const TRACKED_FIELDS = [
  "teamId", "subscriptionId", "subscriptionTitle", "subscriptionPriceCents",
  "items", "discountType", "discountValue", "couponCode", "couponDiscountCents",
  "paidCents", "refundedCents", "status",
  "playerFirstName", "playerLastName", "playerDob", "playerGender",
  "playerPhone", "playerEmail",
  "parent1FirstName", "parent1LastName", "parent1Phone", "parent1Email",
  "parent2FirstName", "parent2LastName", "parent2Phone", "parent2Email",
];

export async function PUT(request, { params }) {
  try {
    const session = await getServerSession(authOptions);
    if (!session || session.user.role !== "club") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const { id, orderId } = await params;
    await dbConnect();

    const order = await Order.findOne({ _id: orderId, activityId: id, clubId: session.user.id });
    if (!order) {
      return NextResponse.json({ error: "Order not found" }, { status: 404 });
    }

    const body = await request.json();
    const logs = [];
    const userName = session.user.name || session.user.username || "Admin";

    for (const field of TRACKED_FIELDS) {
      if (body[field] === undefined) continue;
      const oldVal = field === "items" ? JSON.stringify(order[field]) : String(order[field] ?? "");
      const newVal = field === "items" ? JSON.stringify(body[field]) : String(body[field] ?? "");
      if (oldVal !== newVal) {
        let desc = `Changed ${field}`;
        if (field === "subscriptionPriceCents") {
          desc = `Subscription price: ${formatCents(order[field])} → ${formatCents(body[field])}`;
        } else if (field === "paidCents") {
          desc = `Paid: ${formatCents(order[field])} → ${formatCents(body[field])}`;
        } else if (field === "refundedCents") {
          desc = `Refunded: ${formatCents(order[field])} → ${formatCents(body[field])}`;
        } else if (field === "items") {
          desc = "Items updated";
        } else if (field === "discountType" || field === "discountValue") {
          desc = `Discount changed`;
        } else if (field === "status") {
          desc = `Status: ${order[field]} → ${body[field]}`;
        } else if (field === "teamId") {
          desc = `Team changed`;
        } else if (field === "subscriptionId" || field === "subscriptionTitle") {
          desc = `Subscription changed`;
        }
        logs.push({
          orderId, activityId: id, clubId: session.user.id,
          userId: session.user.id, userName,
          field, previousValue: oldVal, newValue: newVal, description: desc,
        });
      }
    }

    const allowed = [
      "teamId", "subscriptionId", "subscriptionTitle", "subscriptionPriceCents",
      "items", "discountType", "discountValue", "couponCode", "couponDiscountCents",
      "paidCents", "refundedCents", "status",
      "playerFirstName", "playerLastName", "playerDob", "playerGender",
      "playerPhone", "playerEmail",
      "parent1FirstName", "parent1LastName", "parent1Phone", "parent1Email",
      "parent2FirstName", "parent2LastName", "parent2Phone", "parent2Email",
      "formData",
    ];

    for (const key of allowed) {
      if (body[key] !== undefined) {
        order[key] = body[key];
      }
    }

    order.totalCostCents = computeTotal(order);
    await order.save();

    if (logs.length > 0) {
      await OrderLog.insertMany(logs);
    }

    const populated = await Order.findById(order._id)
      .populate("teamId", "name season gender")
      .lean();

    return NextResponse.json({ order: populated });
  } catch (error) {
    console.error("Update order error:", error);
    return NextResponse.json({ error: "Failed to update order" }, { status: 500 });
  }
}

export async function DELETE(request, { params }) {
  try {
    const session = await getServerSession(authOptions);
    if (!session || session.user.role !== "club") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const { id, orderId } = await params;
    await dbConnect();

    const order = await Order.findOneAndDelete({ _id: orderId, activityId: id, clubId: session.user.id });
    if (!order) {
      return NextResponse.json({ error: "Order not found" }, { status: 404 });
    }

    await OrderLog.deleteMany({ orderId });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Delete order error:", error);
    return NextResponse.json({ error: "Failed to delete order" }, { status: 500 });
  }
}
