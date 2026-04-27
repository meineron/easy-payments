import Stripe from "stripe";
import { connectMain } from "@/lib/mongodb";
import { resolvePublicContext, dualSave } from "@/lib/club-context";
import Club from "@/models/Club";

function computeProcessingFee(amountCents) {
  return Math.round((amountCents + 30) / 0.971) - amountCents;
}

async function _POST(req, res) {
  try {
    const { token } = req.query;
    const body = req.body;
    const { chosenInstallments: rawChosen } = body;

    const ctx = await resolvePublicContext("paymentToken", token);
    if (!ctx) {
      return res.status(404).json({ error: "Payment link not found" });
    }
    const { PaymentRequest, Order, Activity } = ctx.models;

    const pr = await PaymentRequest.findOne({ paymentToken: token });
    if (!pr) {
      return res.status(404).json({ error: "Payment link not found" });
    }
    if (pr.status === "paid") {
      return res.status(400).json({ error: "Already paid" });
    }

    const allowed = pr.allowedInstallments || [1];
    const chosen = allowed.includes(Number(rawChosen)) ? Number(rawChosen) : 1;
    pr.chosenInstallments = chosen;

    await connectMain();
    const [order, club, activity] = await Promise.all([
      Order.findById(pr.orderId, "playerFirstName playerLastName parent1Email activityId clubId").lean(),
      Club.findById(pr.clubId, "name hasDirectStripeAccess stripeSecretKey stripeAccountId").lean(),
      pr.activityId ? Activity.findById(pr.activityId, "passStripeFeeToCustomer").lean() : null,
    ]);

    if (!club) {
      return res.status(404).json({ error: "Club not found" });
    }

    let stripeClient;
    let connectedArgs = {};

    if (club.hasDirectStripeAccess && club.stripeSecretKey) {
      stripeClient = new Stripe(club.stripeSecretKey);
    } else if (club.stripeAccountId) {
      stripeClient = new Stripe(process.env.STRIPE_SECRET_KEY);
      connectedArgs = {
        payment_intent_data: {
          transfer_data: { destination: club.stripeAccountId },
          application_fee_amount: Math.max(100, Math.round(pr.totalCents * 0.02)),
        },
      };
    } else {
      return res.status(400).json({ error: "Club payment not configured" });
    }

    const baseUrl = process.env.NEXTAUTH_URL || "http://localhost:3000";
    const successUrl = `${baseUrl}/payment/request/${token}?success=1`;
    const cancelUrl = `${baseUrl}/payment/request/${token}`;

    const metadata = {
      paymentRequestId: String(pr._id),
      orderId: String(pr.orderId),
      activityId: String(pr.activityId),
      clubId: String(pr.clubId),
      type: "payment_request",
      chosenInstallments: String(chosen),
    };

    if (chosen <= 1) {
      const lineItems = pr.items.map((item) => ({
        price_data: {
          currency: "usd",
          product_data: { name: item.name || "Payment" },
          unit_amount: item.amountCents,
        },
        quantity: 1,
      }));

      if (lineItems.length === 0) {
        return res.status(400).json({ error: "Nothing to pay" });
      }

      if (activity?.passStripeFeeToCustomer) {
        const subtotal = lineItems.reduce((s, li) => s + li.price_data.unit_amount * li.quantity, 0);
        const procFee = computeProcessingFee(subtotal);
        if (procFee > 0) {
          lineItems.push({ price_data: { currency: "usd", product_data: { name: "Processing Fee" }, unit_amount: procFee }, quantity: 1 });
        }
      }

      const sessionConfig = {
        mode: "payment",
        line_items: lineItems,
        success_url: successUrl,
        cancel_url: cancelUrl,
        customer_email: pr.recipientEmail || order?.parent1Email || undefined,
        metadata,
        ...connectedArgs,
      };

      const stripeSession = await stripeClient.checkout.sessions.create(sessionConfig);
      pr.stripeSessionId = stripeSession.id;
      await dualSave(ctx, pr);

      return res.status(200).json({ url: stripeSession.url });
    }

    const perInstallment = Math.round(pr.totalCents / chosen);
    const firstAmount = pr.totalCents - perInstallment * (chosen - 1);
    const recurringAmount = perInstallment;
    const recurringCount = chosen - 1;

    const customerEmail = pr.recipientEmail || order?.parent1Email || undefined;
    let customer = null;
    if (customerEmail) {
      const existing = await stripeClient.customers.list({ email: customerEmail, limit: 1 });
      customer = existing.data[0] || await stripeClient.customers.create({
        email: customerEmail,
        name: pr.recipientName || `${order?.playerFirstName} ${order?.playerLastName}`.trim() || undefined,
        metadata,
      });
    } else {
      customer = await stripeClient.customers.create({ metadata });
    }

    const lineItems = [{ price_data: { currency: "usd", product_data: { name: `Payment — installment 1 of ${chosen}` }, unit_amount: firstAmount }, quantity: 1 }];

    if (activity?.passStripeFeeToCustomer) {
      const procFee = computeProcessingFee(firstAmount);
      if (procFee > 0) {
        lineItems.push({ price_data: { currency: "usd", product_data: { name: "Processing Fee" }, unit_amount: procFee }, quantity: 1 });
      }
    }

    const now = new Date();
    const firstInstDate = new Date(now.getFullYear(), now.getMonth() + 1, now.getDate());

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
      metadata: {
        ...metadata,
        setupSubscription: "true",
        recurringAmount: String(recurringAmount),
        recurringCount: String(recurringCount),
        firstInstDate: firstInstDate.toISOString(),
      },
    };

    const stripeSession = await stripeClient.checkout.sessions.create(sessionConfig);
    pr.stripeSessionId = stripeSession.id;
    await dualSave(ctx, pr);

    return res.status(200).json({ url: stripeSession.url });
  } catch (error) {
    console.error("Payment request checkout error:", error);
    return res.status(500).json({ error: "Failed to create checkout session" });
  }
}
export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  return _POST(req, res);
}
