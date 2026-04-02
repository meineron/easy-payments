import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import dbConnect from "@/lib/mongodb";
import mongoose from "mongoose";
import Stripe from "stripe";
import Order from "@/models/Order";
import Activity from "@/models/Activity";
import Club from "@/models/Club";
import { sendCustomPaymentEmail } from "@/lib/email";

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

function formatCents(c) { return "$" + ((c || 0) / 100).toFixed(2); }

function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

export async function POST(request, { params }) {
  try {
    const session = await getServerSession(authOptions);
    if (!session || session.user.role !== "club") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const { id } = await params;
    const body = await request.json();
    const { teamIds, subject, bodyHtml } = body;

    if (!subject?.trim() || !bodyHtml?.trim()) {
      return NextResponse.json({ error: "Subject and message are required" }, { status: 400 });
    }
    if (!teamIds?.length) {
      return NextResponse.json({ error: "Select at least one team" }, { status: 400 });
    }

    await dbConnect();

    const [activity, club] = await Promise.all([
      Activity.findById(id, "title").lean(),
      Club.findById(session.user.id, "name hasDirectStripeAccess stripeSecretKey stripeAccountId").lean(),
    ]);

    if (!activity || !club) {
      return NextResponse.json({ error: "Activity or club not found" }, { status: 404 });
    }

    let stripe, paymentArgs = {};
    if (club.hasDirectStripeAccess && club.stripeSecretKey) {
      stripe = new Stripe(club.stripeSecretKey);
    } else if (club.stripeAccountId) {
      stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
      paymentArgs.payment_intent_data = {
        transfer_data: { destination: club.stripeAccountId },
      };
    } else {
      return NextResponse.json({ error: "Club payment not configured" }, { status: 400 });
    }

    const teamObjectIds = teamIds.map((t) => {
      try { return new mongoose.Types.ObjectId(t); } catch { return t; }
    });
    const filter = {
      activityId: id,
      clubId: session.user.id,
      teamId: { $in: teamObjectIds },
      status: { $ne: "paid" },
      parent1Email: { $exists: true, $ne: "" },
    };
    const orders = await Order.find(filter);

    if (orders.length === 0) {
      console.log("Bulk email: no orders matched. Filter:", JSON.stringify(filter));
      return NextResponse.json({ error: "No unpaid orders with parent emails found for selected teams" }, { status: 404 });
    }
    console.log(`Bulk email: found ${orders.length} matching orders`);

    const baseUrl = process.env.NEXTAUTH_URL || "http://localhost:3000";
    const TEST_MODE = true;
    const TEST_EMAIL = "shlomi@easycoach.club";

    let sentCount = 0;
    let errorCount = 0;

    for (const order of orders) {
      if (TEST_MODE && sentCount >= 1) break;

      try {
        const lineItems = buildLineItems(order);
        if (lineItems.length === 0) continue;

        const totalDiscount = calcTotalDiscount(order);
        const connectedArgs = {};
        if (!club.hasDirectStripeAccess && club.stripeAccountId) {
          connectedArgs.payment_intent_data = {
            transfer_data: { destination: club.stripeAccountId },
            application_fee_amount: Math.max(100, Math.round(order.totalCostCents * 0.02)),
          };
        }

        let stripeCoupon = null;
        if (totalDiscount > 0) {
          stripeCoupon = await stripe.coupons.create({ amount_off: totalDiscount, currency: "usd", duration: "once", name: "Discount" });
        }

        const recipient = TEST_MODE ? TEST_EMAIL : order.parent1Email;

        const sessionConfig = {
          mode: "payment",
          line_items: lineItems,
          success_url: `${baseUrl}/register/${id}/success?session_id={CHECKOUT_SESSION_ID}`,
          cancel_url: `${baseUrl}/register/${id}`,
          customer_email: recipient,
          metadata: { orderId: String(order._id), activityId: String(id), clubId: String(order.clubId), type: "activity_registration" },
          ...connectedArgs,
        };
        if (stripeCoupon) sessionConfig.discounts = [{ coupon: stripeCoupon.id }];

        const stripeSession = await stripe.checkout.sessions.create(sessionConfig);

        order.stripeSessionId = stripeSession.id;
        order.paymentLinkSentAt = new Date();
        await order.save();

        const totalDue = order.totalCostCents - (order.paidCents || 0);

        await sendCustomPaymentEmail(recipient, {
          subject,
          bodyHtml,
          playerName: `${order.playerFirstName} ${order.playerLastName}`,
          clubName: club.name || "",
          activityTitle: activity.title || "",
          paymentUrl: stripeSession.url,
          totalAmount: formatCents(totalDue > 0 ? totalDue : order.totalCostCents),
        });

        sentCount++;

        if (!TEST_MODE && sentCount % 5 === 0) await sleep(500);
      } catch (err) {
        console.error(`Failed to send to ${order.parent1Email}:`, err.message);
        errorCount++;
      }
    }

    return NextResponse.json({ success: true, sentCount, errorCount, total: orders.length });
  } catch (error) {
    console.error("Bulk payment email error:", error);
    return NextResponse.json({ error: "Failed to send payment emails" }, { status: 500 });
  }
}
