import { NextResponse } from "next/server";
import Stripe from "stripe";
import dbConnect from "@/lib/mongodb";
import Order from "@/models/Order";
import Activity from "@/models/Activity";
import Club from "@/models/Club";

function computeProcessingFee(amountCents) {
  return Math.round((amountCents + 30) / 0.971) - amountCents;
}

function computeInstallmentFee(totalCents, chosen, sub) {
  if (!sub) return 0;
  const threshold = sub.installmentFeeThreshold || 0;
  const percent = sub.installmentFeePercent || 0;
  if (threshold <= 0 || percent <= 0 || chosen <= threshold) return 0;
  return Math.round(totalCents * percent / 100);
}

function buildInstallmentSchedule(order, sub, feeCents) {
  const chosen = order.chosenInstallments || 1;
  const feeMode = sub?.installmentFeeMode || "split";
  // Per-order override wins over the subscription default.
  const overrideDue = order.dueDateAmountCents || 0;
  const baseDueAmount = overrideDue > 0
    ? Math.min(overrideDue, order.totalCostCents)
    : (sub?.dueDateAmountCents || order.totalCostCents);
  let dueAmount = baseDueAmount;
  let remaining;

  if (feeCents > 0 && feeMode === "due_date") {
    dueAmount += feeCents;
    remaining = Math.max(0, order.totalCostCents - baseDueAmount);
  } else {
    const effectiveTotal = order.totalCostCents + feeCents;
    remaining = Math.max(0, effectiveTotal - dueAmount);
  }

  const numRemaining = Math.max(0, chosen - 1);
  const schedule = [{ number: 1, date: new Date(), amountCents: dueAmount, status: "pending" }];
  if (numRemaining > 0 && remaining > 0) {
    const perInstallment = Math.round(remaining / numRemaining);
    const now = new Date();
    let firstDate = sub?.firstInstallmentDate ? new Date(sub.firstInstallmentDate) : null;
    if (!firstDate || now > firstDate) {
      firstDate = new Date(now.getFullYear(), now.getMonth() + 1, 1);
    }
    for (let i = 0; i < numRemaining; i++) {
      const d = new Date(firstDate.getFullYear(), firstDate.getMonth() + i, firstDate.getDate());
      const amt = i === numRemaining - 1 ? remaining - perInstallment * (numRemaining - 1) : perInstallment;
      schedule.push({ number: i + 2, date: d, amountCents: amt, status: "pending" });
    }
  }
  return schedule;
}

export async function POST(request, { params }) {
  try {
    const { token } = await params;
    const body = await request.json();
    const { chosenInstallments, payerFirstName, payerLastName, payerEmail } = body;

    await dbConnect();

    const order = await Order.findOne({ paymentToken: token });
    if (!order) {
      return NextResponse.json({ error: "Payment link not found" }, { status: 404 });
    }
    if (order.status === "paid") {
      return NextResponse.json({ error: "Already paid" }, { status: 400 });
    }

    const [activity, club] = await Promise.all([
      Activity.findById(order.activityId, "title clubId subscriptions passStripeFeeToCustomer").lean(),
      Club.findById(order.clubId, "name hasDirectStripeAccess stripeSecretKey stripeAccountId").lean(),
    ]);

    if (!club) {
      return NextResponse.json({ error: "Club not found" }, { status: 404 });
    }

    const actSub = (activity?.subscriptions || []).find((s) => String(s._id) === order.subscriptionId);
    const maxInstallments = actSub?.maxInstallments || 1;
    const chosen = Math.min(Math.max(chosenInstallments || 1, 1), maxInstallments);

    order.chosenInstallments = chosen;
    const feeCents = computeInstallmentFee(order.totalCostCents, chosen, actSub);
    if (feeCents > 0) {
      order.installmentFeeCents = feeCents;
      order.totalCostCents += feeCents;
    }
    const schedule = buildInstallmentSchedule(order, actSub, feeCents);
    order.installmentSchedule = schedule;

    let stripeClient;
    let connectedArgs = {};

    if (club.hasDirectStripeAccess && club.stripeSecretKey) {
      stripeClient = new Stripe(club.stripeSecretKey);
    } else if (club.stripeAccountId) {
      stripeClient = new Stripe(process.env.STRIPE_SECRET_KEY);
      connectedArgs = {
        payment_intent_data: {
          transfer_data: { destination: club.stripeAccountId },
          application_fee_amount: Math.max(100, Math.round(order.totalCostCents * 0.02)),
        },
      };
    } else {
      return NextResponse.json({ error: "Club payment not configured" }, { status: 400 });
    }

    const baseUrl = process.env.NEXTAUTH_URL || "http://localhost:3000";
    const activityId = String(order.activityId);
    const successUrl = `${baseUrl}/register/${activityId}/success?session_id={CHECKOUT_SESSION_ID}`;
    const cancelUrl = `${baseUrl}/payment/${token}`;

    const metadata = {
      orderId: String(order._id),
      activityId,
      clubId: String(order.clubId),
      type: "activity_registration",
    };

    if (chosen <= 1) {
      const lineItems = [];
      if (order.subscriptionPriceCents > 0) {
        lineItems.push({ price_data: { currency: "usd", product_data: { name: order.subscriptionTitle || "Subscription" }, unit_amount: order.subscriptionPriceCents }, quantity: 1 });
      }
      (order.items || []).forEach((item) => {
        if (item.isDiscount || item.priceCents <= 0) return;
        lineItems.push({ price_data: { currency: "usd", product_data: { name: item.name || "Item" }, unit_amount: item.priceCents }, quantity: item.quantity || 1 });
      });
      if (lineItems.length === 0) return NextResponse.json({ error: "Nothing to pay" }, { status: 400 });

      let totalDiscount = 0;
      (order.items || []).filter((i) => i.isDiscount).forEach((i) => { totalDiscount += Math.abs(i.priceCents) * (i.quantity || 1); });
      if (order.discountType === "amount") totalDiscount += order.discountValue || 0;
      else if (order.discountType === "percentage") {
        const sub = order.subscriptionPriceCents || 0;
        const items = (order.items || []).filter((i) => !i.isDiscount).reduce((s, i) => s + i.priceCents * (i.quantity || 1), 0);
        totalDiscount += Math.round((sub + items) * (order.discountValue || 0) / 100);
      }
      totalDiscount += order.couponDiscountCents || 0;

      let stripeCoupon = null;
      if (totalDiscount > 0) {
        stripeCoupon = await stripeClient.coupons.create({ amount_off: totalDiscount, currency: "usd", duration: "once", name: "Discount" });
      }

      if (activity?.passStripeFeeToCustomer) {
        const subtotal = lineItems.reduce((s, li) => s + li.price_data.unit_amount * li.quantity, 0) - totalDiscount;
        const procFee = computeProcessingFee(Math.max(0, subtotal));
        if (procFee > 0) {
          lineItems.push({ price_data: { currency: "usd", product_data: { name: "Processing Fee" }, unit_amount: procFee }, quantity: 1 });
          order.processingFeeCents = procFee;
        }
      }

      const resolvedEmail = payerEmail?.trim() || order.parent1Email || undefined;

      const sessionConfig = {
        mode: "payment",
        line_items: lineItems,
        success_url: successUrl,
        cancel_url: cancelUrl,
        customer_email: resolvedEmail,
        metadata,
        ...connectedArgs,
      };
      if (stripeCoupon) sessionConfig.discounts = [{ coupon: stripeCoupon.id }];

      const session = await stripeClient.checkout.sessions.create(sessionConfig);
      order.stripeSessionId = session.id;
      await order.save();
      return NextResponse.json({ url: session.url });
    }

    // Multi-installment
    const dueDateAmount = schedule[0].amountCents;
    const recurringAmount = schedule.length > 1 ? schedule[1].amountCents : 0;
    const recurringCount = chosen - 1;
    const firstInstDate = schedule.length > 1 ? new Date(schedule[1].date) : null;

    const customerEmail = payerEmail?.trim() || order.parent1Email || undefined;
    const customerName = (payerFirstName && payerLastName)
      ? `${payerFirstName.trim()} ${payerLastName.trim()}`
      : `${order.parent1FirstName || ""} ${order.parent1LastName || ""}`.trim() || undefined;
    let customer = null;
    if (customerEmail) {
      const existing = await stripeClient.customers.list({ email: customerEmail, limit: 1 });
      customer = existing.data[0] || await stripeClient.customers.create({ email: customerEmail, name: customerName, metadata });
    } else {
      customer = await stripeClient.customers.create({ name: customerName, metadata });
    }
    order.stripeCustomerId = customer.id;

    const lineItems = [{ price_data: { currency: "usd", product_data: { name: `${order.subscriptionTitle || "Registration"} — Due Now` }, unit_amount: dueDateAmount }, quantity: 1 }];

    if (activity?.passStripeFeeToCustomer) {
      const procFee = computeProcessingFee(dueDateAmount);
      if (procFee > 0) {
        lineItems.push({ price_data: { currency: "usd", product_data: { name: "Processing Fee" }, unit_amount: procFee }, quantity: 1 });
        order.processingFeeCents = procFee;
      }
    }

    const sessionConfig = {
      mode: "payment",
      line_items: lineItems,
      success_url: successUrl,
      cancel_url: cancelUrl,
      customer: customer.id,
      payment_intent_data: {
        setup_future_usage: "off_session",
        metadata,
        ...(connectedArgs.payment_intent_data || {}),
      },
      metadata: { ...metadata, setupSubscription: "true", recurringAmount: String(recurringAmount), recurringCount: String(recurringCount), firstInstDate: firstInstDate ? firstInstDate.toISOString() : "" },
    };

    const session = await stripeClient.checkout.sessions.create(sessionConfig);
    order.stripeSessionId = session.id;
    await order.save();
    return NextResponse.json({ url: session.url });
  } catch (error) {
    console.error("Payment checkout error:", error);
    return NextResponse.json({ error: "Failed to create checkout session" }, { status: 500 });
  }
}
