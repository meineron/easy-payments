import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import dbConnect from "@/lib/mongodb";
import Stripe from "stripe";
import Order from "@/models/Order";
import Activity from "@/models/Activity";
import Club from "@/models/Club";

function buildLineItems(order) {
  const lineItems = [];
  if (order.subscriptionPriceCents > 0) {
    lineItems.push({
      price_data: { currency: "usd", product_data: { name: order.subscriptionTitle || "Subscription" }, unit_amount: order.subscriptionPriceCents },
      quantity: 1,
    });
  }
  (order.items || []).forEach((item) => {
    if (item.isDiscount || item.priceCents <= 0) return;
    lineItems.push({
      price_data: { currency: "usd", product_data: { name: item.name || "Item" }, unit_amount: item.priceCents },
      quantity: item.quantity || 1,
    });
  });
  return lineItems;
}

function calcTotalDiscount(order) {
  let d = 0;
  (order.items || []).filter((i) => i.isDiscount).forEach((i) => { d += Math.abs(i.priceCents) * (i.quantity || 1); });
  if (order.discountType === "amount") d += order.discountValue || 0;
  else if (order.discountType === "percentage") {
    const sub = order.subscriptionPriceCents || 0;
    const items = (order.items || []).filter((i) => !i.isDiscount).reduce((s, i) => s + i.priceCents * (i.quantity || 1), 0);
    d += Math.round((sub + items) * (order.discountValue || 0) / 100);
  }
  d += order.couponDiscountCents || 0;
  return d;
}

export async function POST(request, { params }) {
  try {
    const session = await getServerSession(authOptions);
    if (!session || session.user.role !== "club") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const { id, orderId } = await params;
    await dbConnect();

    const order = await Order.findOne({ _id: orderId, activityId: id, clubId: session.user.id });
    if (!order) return NextResponse.json({ error: "Order not found" }, { status: 404 });
    if (!order.parent1Email) return NextResponse.json({ error: "No parent email" }, { status: 400 });
    if (order.status === "paid") return NextResponse.json({ error: "Already paid" }, { status: 400 });

    const [activity, club] = await Promise.all([
      Activity.findById(id, "title").lean(),
      Club.findById(session.user.id, "name hasDirectStripeAccess stripeSecretKey stripeAccountId").lean(),
    ]);

    let stripe, paymentArgs = {};
    if (club.hasDirectStripeAccess && club.stripeSecretKey) {
      stripe = new Stripe(club.stripeSecretKey);
    } else if (club.stripeAccountId) {
      stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
      paymentArgs.payment_intent_data = {
        transfer_data: { destination: club.stripeAccountId },
        application_fee_amount: Math.max(100, Math.round(order.totalCostCents * 0.02)),
      };
    } else {
      return NextResponse.json({ error: "Club payment not configured" }, { status: 400 });
    }

    const lineItems = buildLineItems(order);
    if (lineItems.length === 0) return NextResponse.json({ error: "Nothing to pay" }, { status: 400 });

    const baseUrl = process.env.NEXTAUTH_URL || "http://localhost:3000";
    const totalDiscount = calcTotalDiscount(order);
    let stripeCoupon = null;
    if (totalDiscount > 0) {
      stripeCoupon = await stripe.coupons.create({ amount_off: totalDiscount, currency: "usd", duration: "once", name: "Discount" });
    }

    const sessionConfig = {
      mode: "payment",
      line_items: lineItems,
      success_url: `${baseUrl}/register/${id}/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${baseUrl}/register/${id}`,
      customer_email: order.parent1Email,
      metadata: { orderId: String(order._id), activityId: String(id), clubId: String(order.clubId), type: "activity_registration" },
      ...paymentArgs,
    };
    if (stripeCoupon) sessionConfig.discounts = [{ coupon: stripeCoupon.id }];

    const stripeSession = await stripe.checkout.sessions.create(sessionConfig);
    order.stripeSessionId = stripeSession.id;
    order.paymentLinkSentAt = new Date();
    await order.save();

    return NextResponse.json({ success: true, paymentUrl: stripeSession.url, paymentLinkSentAt: order.paymentLinkSentAt });
  } catch (error) {
    console.error("Send payment link error:", error);
    return NextResponse.json({ error: "Failed to send payment link" }, { status: 500 });
  }
}
