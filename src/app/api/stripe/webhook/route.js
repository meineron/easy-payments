import { NextResponse } from "next/server";
import Stripe from "stripe";
import { stripe } from "@/lib/stripe";
import dbConnect from "@/lib/mongodb";
import Club from "@/models/Club";
import Transaction from "@/models/Transaction";
import Registration from "@/models/Registration";
import Order from "@/models/Order";

export async function POST(request) {
  const body = await request.text();
  const signature = request.headers.get("stripe-signature");

  let event;

  try {
    event = stripe.webhooks.constructEvent(
      body,
      signature,
      process.env.STRIPE_WEBHOOK_SECRET
    );
  } catch (err) {
    await dbConnect();
    const directClubs = await Club.find({
      hasDirectStripeAccess: true,
      stripeWebhookSecret: { $ne: null, $exists: true },
    }).select("stripeSecretKey stripeWebhookSecret").lean();

    let matched = false;
    for (const club of directClubs) {
      try {
        const clubStripe = new Stripe(club.stripeSecretKey);
        event = clubStripe.webhooks.constructEvent(body, signature, club.stripeWebhookSecret);
        matched = true;
        break;
      } catch { /* try next club */ }
    }

    if (!matched) {
      console.error("Webhook signature verification failed:", err.message);
      return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
    }
  }

  await dbConnect();

  switch (event.type) {
    case "checkout.session.completed": {
      const session = event.data.object;
      const clubId = session.metadata?.clubId;

      if (!clubId) break;

      const existing = await Transaction.findOne({ stripeSessionId: session.id });
      if (existing) break;

      let invoiceUrl = null;
      let invoicePdf = null;

      if (session.invoice) {
        try {
          const invoice = await stripe.invoices.retrieve(session.invoice);
          invoiceUrl = invoice.hosted_invoice_url;
          invoicePdf = invoice.invoice_pdf;
        } catch (err) {
          console.error("Failed to retrieve invoice:", err.message);
        }
      }

      await Transaction.create({
        clubId,
        stripeSessionId: session.id,
        stripePaymentIntentId: session.payment_intent,
        amount: session.amount_total,
        applicationFee: 100,
        currency: session.currency,
        status: session.payment_status === "paid" ? "succeeded" : "pending",
        invoiceUrl,
        invoicePdf,
        customerEmail: session.customer_details?.email || null,
      });

      const registrationId = session.metadata?.registrationId;
      if (registrationId && session.payment_status === "paid") {
        const type = session.metadata?.type;
        if (type === "single_payment") {
          await Registration.findByIdAndUpdate(registrationId, {
            collectedCents: session.amount_total,
            status: "completed",
            stripeSessionId: session.id,
          });
        } else if (type === "installment" && session.subscription) {
          await Registration.findByIdAndUpdate(registrationId, {
            $inc: { collectedCents: session.amount_total },
            status: "active",
            stripeSessionId: session.id,
            stripeSubscriptionId: session.subscription,
          });

          try {
            const sub = await stripe.subscriptions.retrieve(session.subscription);
            const cancelAt = sub.metadata?.cancelAt;
            if (cancelAt) {
              await stripe.subscriptions.update(session.subscription, {
                cancel_at: parseInt(cancelAt, 10),
              });
            }
          } catch (subErr) {
            console.error("Failed to set cancel_at on subscription:", subErr.message);
          }
        }
      }

      const activityOrderId = session.metadata?.orderId;
      const metaType = session.metadata?.type;
      if (activityOrderId && metaType === "activity_registration" && session.payment_status === "paid") {
        try {
          const order = await Order.findById(activityOrderId);
          if (order) {
            order.paidCents = session.amount_total;
            order.status = "paid";
            order.stripeSessionId = session.id;
            order.stripePaymentIntentId = session.payment_intent || "";
            order.registrationCompletedAt = new Date();
            await order.save();

            try {
              const { sendInvoiceEmail } = await import("@/lib/email");
              const Activity = (await import("@/models/Activity")).default;
              const activityDoc = await Activity.findById(order.activityId, "title clubId").lean();
              const clubDoc = await Club.findById(order.clubId, "name").lean();
              if (order.parent1Email) {
                await sendInvoiceEmail(order.parent1Email, {
                  playerName: `${order.playerFirstName} ${order.playerLastName}`,
                  clubName: clubDoc?.name || "",
                  activityTitle: activityDoc?.title || "",
                  teamName: "",
                  subscriptionTitle: order.subscriptionTitle || "",
                  items: order.items || [],
                  totalCents: order.totalCostCents,
                  paidCents: session.amount_total,
                });
                order.invoiceSentAt = new Date();
                await order.save();
              }
            } catch (emailErr) {
              console.error("Failed to send invoice email:", emailErr.message);
            }

            console.log(`Activity order ${activityOrderId} marked paid`);
          }
        } catch (orderErr) {
          console.error("Failed to update activity order:", orderErr.message);
        }
      }

      console.log(`Transaction saved for club ${clubId}, session ${session.id}`);
      break;
    }

    case "account.updated": {
      const account = event.data.object;

      if (account.details_submitted && account.charges_enabled) {
        const club = await Club.findOne({ stripeAccountId: account.id });
        if (club && !club.onboardingComplete) {
          club.onboardingComplete = true;
          await club.save();
          console.log(`Club ${club.name} onboarding marked complete via webhook`);
        }
      }
      break;
    }

    case "checkout.session.async_payment_succeeded": {
      const session = event.data.object;
      await Transaction.findOneAndUpdate(
        { stripeSessionId: session.id },
        { status: "succeeded" }
      );
      break;
    }

    case "checkout.session.async_payment_failed": {
      const session = event.data.object;
      await Transaction.findOneAndUpdate(
        { stripeSessionId: session.id },
        { status: "failed" }
      );
      break;
    }

    case "invoice.paid": {
      const invoice = event.data.object;
      if (!invoice.subscription) break;

      const existing = await Transaction.findOne({ stripeSessionId: invoice.id });
      if (existing) break;

      let clubId = null;
      let registrationId = null;
      try {
        const sub = await stripe.subscriptions.retrieve(invoice.subscription);
        clubId = sub.metadata?.clubId;
        registrationId = sub.metadata?.registrationId;
      } catch (err) {
        console.error("Failed to retrieve subscription:", err.message);
      }

      if (!clubId) break;

      await Transaction.create({
        clubId,
        stripeSessionId: invoice.id,
        stripePaymentIntentId: invoice.payment_intent,
        amount: invoice.amount_paid,
        applicationFee: Math.round(invoice.amount_paid * 0.02),
        currency: invoice.currency,
        status: "succeeded",
        invoiceUrl: invoice.hosted_invoice_url || null,
        invoicePdf: invoice.invoice_pdf || null,
        customerEmail: invoice.customer_email || null,
      });

      if (registrationId && invoice.amount_paid > 0) {
        const reg = await Registration.findById(registrationId);
        if (reg) {
          const newCollected = reg.collectedCents + invoice.amount_paid;
          const isComplete = newCollected >= reg.finalCostCents;
          await Registration.findByIdAndUpdate(registrationId, {
            collectedCents: newCollected,
            status: isComplete ? "completed" : "active",
          });
        }
      }

      console.log(`Installment payment recorded for club ${clubId}, invoice ${invoice.id}`);
      break;
    }

    case "invoice.payment_failed": {
      const invoice = event.data.object;
      if (!invoice.subscription) break;

      try {
        const sub = await stripe.subscriptions.retrieve(invoice.subscription);
        const registrationId = sub.metadata?.registrationId;
        if (registrationId) {
          await Registration.findByIdAndUpdate(registrationId, { status: "failed" });
        }
      } catch (err) {
        console.error("Failed to update registration on payment failure:", err.message);
      }

      console.error(`Installment payment failed: invoice ${invoice.id}, subscription ${invoice.subscription}`);
      break;
    }

    case "customer.subscription.deleted": {
      const subscription = event.data.object;
      const registrationId = subscription.metadata?.registrationId;
      if (registrationId) {
        const reg = await Registration.findById(registrationId);
        if (reg && reg.status !== "completed") {
          const isComplete = reg.collectedCents >= reg.finalCostCents;
          await Registration.findByIdAndUpdate(registrationId, {
            status: isComplete ? "completed" : reg.status,
          });
        }
      }

      const teamName = subscription.metadata?.teamName || "Unknown";
      const season = subscription.metadata?.season || "";
      console.log(`Subscription ${subscription.id} ended for ${teamName} (${season})`);
      break;
    }

    default:
      console.log(`Unhandled event type: ${event.type}`);
  }

  return NextResponse.json({ received: true });
}
