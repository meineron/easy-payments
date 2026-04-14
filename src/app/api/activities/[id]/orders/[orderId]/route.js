import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import Stripe from "stripe";
import { authOptions } from "@/lib/auth";
import dbConnect from "@/lib/mongodb";
import Order from "@/models/Order";
import OrderLog from "@/models/OrderLog";
import Club from "@/models/Club";
import Transaction from "@/models/Transaction";
import PaymentRequest from "@/models/PaymentRequest";
import Player from "@/models/Player";
import Parent from "@/models/Parent";

function computeTotal(order) {
  let total = order.subscriptionPriceCents || 0;
  (order.items || []).forEach((item) => {
    const amt = (item.priceCents || 0) * (item.quantity || 1);
    if (item.isDiscount) total -= amt; else total += amt;
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

async function getStripeClientForClub(clubId) {
  const club = await Club.findById(clubId, "hasDirectStripeAccess stripeSecretKey stripeAccountId").lean();
  if (!club) return null;
  if (club.hasDirectStripeAccess && club.stripeSecretKey) {
    return new Stripe(club.stripeSecretKey);
  }
  return new Stripe(process.env.STRIPE_SECRET_KEY);
}

async function syncInstallmentsToStripe(order) {
  try {
    const stripeClient = await getStripeClientForClub(order.clubId);
    if (!stripeClient) return { error: "No Stripe client for club" };

    const sub = await stripeClient.subscriptions.retrieve(order.stripeSubscriptionId);
    if (sub.status !== "active" && sub.status !== "trialing") {
      return { skipped: true, reason: `Subscription status: ${sub.status}` };
    }

    const nextPending = (order.installmentSchedule || []).find((i) => i.status === "pending");

    if (!nextPending) {
      await stripeClient.subscriptions.cancel(order.stripeSubscriptionId);
      order.stripeSubscriptionId = "";
      await order.save();
      return { cancelled: true };
    }

    const currentItem = sub.items.data[0];
    const currentAmount = currentItem.price.unit_amount;
    const nextChargeSec = Math.floor(new Date(nextPending.date).getTime() / 1000);
    const currentNextCharge = sub.current_period_end;

    const amountChanged = currentAmount !== nextPending.amountCents;
    const dateChanged = Math.abs(nextChargeSec - currentNextCharge) > 86400;

    if (!amountChanged && !dateChanged) return { unchanged: true };

    const updateParams = { proration_behavior: "none" };

    if (amountChanged) {
      const product = typeof currentItem.price.product === "string"
        ? currentItem.price.product : currentItem.price.product.id;
      const newPrice = await stripeClient.prices.create({
        currency: currentItem.price.currency,
        unit_amount: nextPending.amountCents,
        recurring: { interval: "month" },
        product,
      });
      updateParams.items = [{ id: currentItem.id, price: newPrice.id }];
    }

    if (dateChanged) {
      updateParams.trial_end = nextChargeSec;
    }

    await stripeClient.subscriptions.update(order.stripeSubscriptionId, updateParams);
    return { amountUpdated: amountChanged, dateUpdated: dateChanged };
  } catch (err) {
    console.error("Stripe installment sync error:", err.message);
    return { error: err.message };
  }
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

    const [logs, transactions, paymentRequests] = await Promise.all([
      OrderLog.find({ orderId }).sort({ createdAt: -1 }).lean(),
      Transaction.find({ orderId }).sort({ createdAt: -1 }).lean(),
      PaymentRequest.find({ orderId, clubId: session.user.id }).sort({ createdAt: -1 }).lean(),
    ]);

    return NextResponse.json({ order, logs, transactions, paymentRequests });
  } catch (error) {
    console.error("Get order error:", error);
    return NextResponse.json({ error: "Failed to get order" }, { status: 500 });
  }
}

const TRACKED_FIELDS = [
  "teamId", "subscriptionId", "subscriptionTitle", "subscriptionPriceCents",
  "items", "discountType", "discountValue", "couponCode", "couponDiscountCents",
  "paidCents", "refundedCents", "status", "installmentSchedule",
  "playerFirstName", "playerLastName", "playerDob", "playerGender",
  "playerPhonePrefix", "playerPhone", "playerEmail",
  "parent1FirstName", "parent1LastName", "parent1PhonePrefix", "parent1Phone", "parent1Email",
  "parent2FirstName", "parent2LastName", "parent2PhonePrefix", "parent2Phone", "parent2Email",
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
    const changeReason = body._reason || "";

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
        } else if (field === "installmentSchedule") {
          desc = "Installment schedule updated";
        } else if (field === "discountType" || field === "discountValue") {
          desc = `Discount changed`;
        } else if (field === "status") {
          desc = `Status: ${order[field]} → ${body[field]}`;
        } else if (field === "teamId") {
          desc = `Team changed`;
        } else if (field === "subscriptionId" || field === "subscriptionTitle") {
          desc = `Subscription changed`;
        }
        if (changeReason) desc += ` — Reason: ${changeReason}`;
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
      "paidCents", "refundedCents", "status", "installmentSchedule",
      "playerFirstName", "playerLastName", "playerDob", "playerGender",
      "playerPhonePrefix", "playerPhone", "playerEmail",
      "parent1FirstName", "parent1LastName", "parent1PhonePrefix", "parent1Phone", "parent1Email",
      "parent2FirstName", "parent2LastName", "parent2PhonePrefix", "parent2Phone", "parent2Email",
      "formData",
    ];

    for (const key of allowed) {
      if (body[key] !== undefined) {
        order[key] = body[key];
      }
    }

    order.totalCostCents = computeTotal(order);
    await order.save();

    const parentFieldChanged = [
      "parent1FirstName", "parent1LastName", "parent1PhonePrefix", "parent1Phone", "parent1Email",
      "parent2FirstName", "parent2LastName", "parent2PhonePrefix", "parent2Phone", "parent2Email",
    ].some((f) => body[f] !== undefined);

    if (parentFieldChanged && order.playerId) {
      try {
        for (const slot of ["parent1", "parent2"]) {
          const firstName = order[`${slot}FirstName`];
          const lastName = order[`${slot}LastName`];
          const email = order[`${slot}Email`];
          const phone = order[`${slot}Phone`];
          const phonePrefix = order[`${slot}PhonePrefix`] || "+1";
          if (!firstName || !lastName || !email) continue;

          let parent = await Parent.findOne({ clubId: session.user.id, email: email.trim().toLowerCase() });
          if (parent) {
            parent.firstName = firstName.trim();
            parent.lastName = lastName.trim();
            if (phone) { parent.phone = phone.trim(); parent.phonePrefix = phonePrefix; }
            await parent.save();
          } else {
            parent = await Parent.create({
              clubId: session.user.id,
              firstName: firstName.trim(),
              lastName: lastName.trim(),
              email: email.trim().toLowerCase(),
              phonePrefix,
              phone: (phone || "").trim() || "0000000000",
            });
          }
          await Player.updateOne({ _id: order.playerId }, { $addToSet: { parents: parent._id } });
          await Parent.updateOne({ _id: parent._id }, { $addToSet: { players: order.playerId } });
        }
      } catch (e) {
        console.error("Parent sync on order update:", e);
      }
    }

    if (logs.length > 0) {
      await OrderLog.insertMany(logs);
    }

    let stripeSync = null;
    if (body.installmentSchedule && order.stripeSubscriptionId) {
      stripeSync = await syncInstallmentsToStripe(order);
    }

    const populated = await Order.findById(order._id)
      .populate("teamId", "name season gender")
      .lean();

    return NextResponse.json({ order: populated, stripeSync });
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
