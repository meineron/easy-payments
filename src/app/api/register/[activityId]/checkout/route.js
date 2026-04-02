import { NextResponse } from "next/server";
import Stripe from "stripe";
import dbConnect from "@/lib/mongodb";
import Order from "@/models/Order";
import Activity from "@/models/Activity";
import Club from "@/models/Club";

export async function POST(request, { params }) {
  try {
    const { activityId } = await params;
    const body = await request.json();
    const { orderId, token, adminReturn } = body;

    await dbConnect();

    let order;
    if (token) {
      order = await Order.findOne({ registrationToken: token, activityId });
    } else if (orderId) {
      order = await Order.findOne({ _id: orderId, activityId });
    }

    if (!order) {
      return NextResponse.json({ error: "Order not found" }, { status: 404 });
    }

    if (order.status === "paid") {
      return NextResponse.json({ error: "Already paid" }, { status: 400 });
    }

    const [activity, club] = await Promise.all([
      Activity.findById(activityId, "title clubId").lean(),
      Club.findById(order.clubId, "name hasDirectStripeAccess stripeSecretKey stripeAccountId").lean(),
    ]);

    if (!club) {
      return NextResponse.json({ error: "Club not found" }, { status: 404 });
    }

    let stripe;
    let paymentArgs = {};

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

    const lineItems = [];

    if (order.subscriptionPriceCents > 0) {
      lineItems.push({
        price_data: {
          currency: "usd",
          product_data: { name: order.subscriptionTitle || "Subscription" },
          unit_amount: order.subscriptionPriceCents,
        },
        quantity: 1,
      });
    }

    (order.items || []).forEach((item) => {
      if (item.isDiscount) return;
      if (item.priceCents > 0) {
        lineItems.push({
          price_data: {
            currency: "usd",
            product_data: { name: item.name || "Item" },
            unit_amount: item.priceCents,
          },
          quantity: item.quantity || 1,
        });
      }
    });

    if (lineItems.length === 0) {
      return NextResponse.json({ error: "Nothing to pay" }, { status: 400 });
    }

    let totalDiscount = 0;
    (order.items || []).filter((i) => i.isDiscount).forEach((item) => {
      totalDiscount += Math.abs(item.priceCents) * (item.quantity || 1);
    });
    if (order.discountType === "amount") totalDiscount += order.discountValue || 0;
    else if (order.discountType === "percentage") {
      const sub = order.subscriptionPriceCents || 0;
      const items = (order.items || []).filter((i) => !i.isDiscount).reduce((s, i) => s + i.priceCents * (i.quantity || 1), 0);
      totalDiscount += Math.round((sub + items) * (order.discountValue || 0) / 100);
    }
    totalDiscount += order.couponDiscountCents || 0;

    let stripeCoupon = null;
    if (totalDiscount > 0) {
      stripeCoupon = await stripe.coupons.create({
        amount_off: totalDiscount,
        currency: "usd",
        duration: "once",
        name: "Registration Discount",
      });
    }

    const baseUrl = process.env.NEXTAUTH_URL || "http://localhost:3000";
    const successUrl = adminReturn
      ? `${baseUrl}/dashboard/activities/${activityId}?tab=participants&paid=1`
      : `${baseUrl}/register/${activityId}/success?session_id={CHECKOUT_SESSION_ID}`;
    const cancelUrl = adminReturn
      ? `${baseUrl}/dashboard/activities/${activityId}?tab=participants`
      : token ? `${baseUrl}/register/${activityId}?token=${token}` : `${baseUrl}/register/${activityId}`;
    const sessionConfig = {
      mode: "payment",
      line_items: lineItems,
      success_url: successUrl,
      cancel_url: cancelUrl,
      customer_email: order.parent1Email || undefined,
      metadata: {
        orderId: String(order._id),
        activityId: String(activityId),
        clubId: String(order.clubId),
        type: "activity_registration",
      },
      ...paymentArgs,
    };

    if (stripeCoupon) {
      sessionConfig.discounts = [{ coupon: stripeCoupon.id }];
    }

    const session = await stripe.checkout.sessions.create(sessionConfig);

    order.stripeSessionId = session.id;
    await order.save();

    return NextResponse.json({ url: session.url });
  } catch (error) {
    console.error("Create checkout error:", error);
    return NextResponse.json({ error: "Failed to create checkout session" }, { status: 500 });
  }
}
