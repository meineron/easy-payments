import { NextResponse } from "next/server";
import Stripe from "stripe";
import dbConnect from "@/lib/mongodb";
import PaymentRequest from "@/models/PaymentRequest";
import Order from "@/models/Order";
import Club from "@/models/Club";
import Activity from "@/models/Activity";

export async function POST(request, { params }) {
  try {
    const { token } = await params;
    await dbConnect();

    const pr = await PaymentRequest.findOne({ paymentToken: token });
    if (!pr) {
      return NextResponse.json({ error: "Payment link not found" }, { status: 404 });
    }
    if (pr.status === "paid") {
      return NextResponse.json({ error: "Already paid" }, { status: 400 });
    }

    const [order, club, activity] = await Promise.all([
      Order.findById(pr.orderId, "playerFirstName playerLastName parent1Email activityId clubId").lean(),
      Club.findById(pr.clubId, "name hasDirectStripeAccess stripeSecretKey stripeAccountId").lean(),
      pr.activityId ? Activity.findById(pr.activityId, "passStripeFeeToCustomer").lean() : null,
    ]);

    if (!club) {
      return NextResponse.json({ error: "Club not found" }, { status: 404 });
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
      return NextResponse.json({ error: "Club payment not configured" }, { status: 400 });
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
    };

    const lineItems = pr.items.map((item) => ({
      price_data: {
        currency: "usd",
        product_data: { name: item.name || "Payment" },
        unit_amount: item.amountCents,
      },
      quantity: 1,
    }));

    if (lineItems.length === 0) {
      return NextResponse.json({ error: "Nothing to pay" }, { status: 400 });
    }

    if (activity?.passStripeFeeToCustomer) {
      const subtotal = lineItems.reduce((s, li) => s + li.price_data.unit_amount * li.quantity, 0);
      const procFee = Math.round((subtotal + 30) / 0.971) - subtotal;
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
    await pr.save();

    return NextResponse.json({ url: stripeSession.url });
  } catch (error) {
    console.error("Payment request checkout error:", error);
    return NextResponse.json({ error: "Failed to create checkout session" }, { status: 500 });
  }
}
