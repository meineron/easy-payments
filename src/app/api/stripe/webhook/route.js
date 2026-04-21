import { NextResponse } from "next/server";
import Stripe from "stripe";
import { stripe } from "@/lib/stripe";
import dbConnect from "@/lib/mongodb";
import Club from "@/models/Club";
import Transaction from "@/models/Transaction";
import Registration from "@/models/Registration";
import Order from "@/models/Order";
import PaymentRequest from "@/models/PaymentRequest";

// Generating the registration PDF + sending multiple emails can easily exceed
// the default 10s serverless timeout. 60s is the hard ceiling Vercel allows
// for standard serverless functions and gives us ample headroom.
export const maxDuration = 60;

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

      // We used to `break` here on duplicate delivery, but that also skipped
      // the email side-effects. Now we just skip the Transaction.create so
      // Stripe's automatic retries can re-attempt any email that hasn't
      // been recorded as sent yet. Each downstream side-effect is guarded
      // by its own idempotency marker (paidCents via stripeSessionId check,
      // invoiceSentAt, registrationEmailSentAt, etc.).
      const alreadyRecordedTransaction = !!(await Transaction.findOne({ stripeSessionId: session.id }));

      let invoiceUrl = null;
      let invoicePdf = null;

      if (!alreadyRecordedTransaction && session.invoice) {
        try {
          const invoice = await stripe.invoices.retrieve(session.invoice);
          invoiceUrl = invoice.hosted_invoice_url;
          invoicePdf = invoice.invoice_pdf;
        } catch (err) {
          console.error("Failed to retrieve invoice:", err.message);
        }
      }

      if (!alreadyRecordedTransaction) {
        try {
          await Transaction.create({
            clubId,
            orderId: session.metadata?.orderId || null,
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
        } catch (err) {
          // Duplicate key is fine — another retry beat us to it.
          if (err.code !== 11000) {
            console.error("Failed to record transaction:", err.message);
          }
        }
      }

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
            // The parent may have been charged a pass-through Stripe processing fee
            // on top of the order amount. Exclude that fee when tallying paidCents
            // so the club only sees what was actually applied to the invoice.
            const procFeeInSession = parseInt(session.metadata?.processingFeeCents || "0", 10) || 0;
            const netAmountPaid = Math.max(0, (session.amount_total || 0) - procFeeInSession);

            // Idempotency guard: if this exact session was already applied to this
            // order, skip the financial mutation so retries don't double-add paidCents.
            // Emails further below still re-attempt based on their own markers.
            const alreadyApplied = order.stripeSessionId === session.id && !!order.registrationCompletedAt;

            if (!alreadyApplied) {
              order.paidCents = (order.paidCents || 0) + netAmountPaid;
              order.stripeSessionId = session.id;
              order.stripePaymentIntentId = session.payment_intent || "";
              order.registrationCompletedAt = order.registrationCompletedAt || new Date();

              if (order.installmentSchedule?.length > 0) {
                const firstPending = order.installmentSchedule.find((i) => i.status === "pending");
                if (firstPending) { firstPending.status = "paid"; firstPending.paidAt = new Date(); firstPending.paymentMethod = "card"; }
              }

              const needsSubscription = session.metadata?.setupSubscription === "true";
              const recurringAmount = parseInt(session.metadata?.recurringAmount || "0", 10);
              const recurringCount = parseInt(session.metadata?.recurringCount || "0", 10);

              if (needsSubscription && recurringAmount > 0 && recurringCount > 0 && !order.stripeSubscriptionId) {
                order.status = "partial";
                try {
                  const clubForSub = await Club.findById(order.clubId, "hasDirectStripeAccess stripeSecretKey stripeAccountId").lean();
                  let subStripe;
                  if (clubForSub.hasDirectStripeAccess && clubForSub.stripeSecretKey) {
                    subStripe = new Stripe(clubForSub.stripeSecretKey);
                  } else {
                    subStripe = new Stripe(process.env.STRIPE_SECRET_KEY);
                  }

                  const customerId = order.stripeCustomerId || session.customer;
                  if (customerId) {
                    const price = await subStripe.prices.create({
                      currency: "usd", unit_amount: recurringAmount,
                      recurring: { interval: "month" },
                      product_data: { name: `${order.subscriptionTitle || "Registration"} Installment` },
                    });

                    const firstInstDate = session.metadata?.firstInstDate;
                    const billingAnchor = firstInstDate ? Math.floor(new Date(firstInstDate).getTime() / 1000) : undefined;

                    const subParams = {
                      customer: customerId,
                      items: [{ price: price.id }],
                      default_payment_method: session.payment_intent ? (await subStripe.paymentIntents.retrieve(session.payment_intent)).payment_method : undefined,
                      metadata: { orderId: String(order._id), activityId: String(order.activityId), clubId: String(order.clubId) },
                      cancel_after: recurringCount,
                    };
                    if (billingAnchor) {
                      subParams.billing_cycle_anchor = billingAnchor;
                      subParams.proration_behavior = "none";
                    }

                    const stripeSub = await subStripe.subscriptions.create(subParams);
                    order.stripeSubscriptionId = stripeSub.id;
                    order.stripeCustomerId = customerId;
                  }
                } catch (subErr) {
                  console.error("Failed to create installment subscription:", subErr.message);
                }
              } else {
                order.status = order.paidCents >= order.totalCostCents ? "paid" : "partial";
              }

              await order.save();

              try {
                const { markPlayerRegisteredForTeam } = await import("@/lib/order-sync");
                await markPlayerRegisteredForTeam(order.playerId, order.teamId, order.registrationCompletedAt);
              } catch (e) { console.error("Mark player registered (webhook):", e.message); }
            }

            // --- EMAIL SIDE-EFFECTS (idempotent, retry-safe) -----------------
            // Each email is gated by its own "sentAt" marker so that a retried
            // webhook will only re-attempt whichever emails didn't succeed on
            // the previous try.

            if (!order.invoiceSentAt && order.parent1Email) {
              try {
                const { sendInvoiceEmail } = await import("@/lib/email");
                const Activity = (await import("@/models/Activity")).default;
                const activityDoc = await Activity.findById(order.activityId, "title clubId").lean();
                const clubDoc = await Club.findById(order.clubId, "name logoUrl language").lean();
                await sendInvoiceEmail(order.parent1Email, {
                  playerName: `${order.playerFirstName} ${order.playerLastName}`,
                  clubName: clubDoc?.name || "",
                  activityTitle: activityDoc?.title || "",
                  teamName: "",
                  subscriptionTitle: order.subscriptionTitle || "",
                  items: order.items || [],
                  totalCents: order.totalCostCents,
                  paidCents: netAmountPaid,
                  logoUrl: clubDoc?.logoUrl || null,
                  locale: clubDoc?.language || "en",
                });
                order.invoiceSentAt = new Date();
                await order.save();
              } catch (emailErr) {
                console.error("Failed to send invoice email:", emailErr.message);
              }
            }

            if (!order.registrationEmailSentAt) {
              try {
                const { sendRegistrationPDFEmail } = await import("@/lib/registration-email");
                await sendRegistrationPDFEmail(order);
                order.registrationEmailSentAt = new Date();
                await order.save();
              } catch (pdfErr) {
                console.error("Failed to send registration PDF:", pdfErr.message);
              }
            }

            console.log(`Activity order ${activityOrderId} processed: net paid ${netAmountPaid} (gross ${session.amount_total}, proc fee ${procFeeInSession}), applied=${!alreadyApplied}, invoiceSent=${!!order.invoiceSentAt}, regEmailSent=${!!order.registrationEmailSentAt}`);
          }
        } catch (orderErr) {
          console.error("Failed to update activity order:", orderErr.message);
        }
      }

      const prId = session.metadata?.paymentRequestId;
      const prType = session.metadata?.type;
      if (prId && prType === "payment_request" && session.payment_status === "paid") {
        try {
          const pr = await PaymentRequest.findById(prId);
          if (pr && pr.status !== "paid") {
            pr.paidCents = pr.totalCents;
            pr.status = "paid";
            pr.paidAt = new Date();
            pr.stripeSessionId = session.id;
            pr.stripePaymentIntentId = session.payment_intent || "";
            await pr.save();

            const prOrder = await Order.findById(pr.orderId);
            if (prOrder) {
              prOrder.paidCents = (prOrder.paidCents || 0) + pr.totalCents;
              prOrder.status = prOrder.paidCents >= prOrder.totalCostCents ? "paid" : "partial";
              await prOrder.save();
            }

            try {
              const { sendInvoiceEmail } = await import("@/lib/email");
              const Activity = (await import("@/models/Activity")).default;
              const actDoc = await Activity.findById(pr.activityId, "title").lean();
              const clubDoc = await Club.findById(pr.clubId, "name logoUrl language").lean();
              const orderDoc = await Order.findById(pr.orderId).lean();
              const emailTo = pr.recipientEmail || orderDoc?.parent1Email;
              if (emailTo) {
                await sendInvoiceEmail(emailTo, {
                  playerName: `${orderDoc?.playerFirstName || ""} ${orderDoc?.playerLastName || ""}`.trim(),
                  clubName: clubDoc?.name || "",
                  activityTitle: actDoc?.title || "",
                  teamName: "",
                  subscriptionTitle: "",
                  items: pr.items.map((i) => ({ name: i.name, priceCents: i.amountCents, quantity: 1 })),
                  totalCents: pr.totalCents,
                  paidCents: pr.totalCents,
                  logoUrl: clubDoc?.logoUrl || null,
                  locale: clubDoc?.language || "en",
                });
              }
            } catch (emailErr) {
              console.error("Failed to send payment request receipt:", emailErr.message);
            }

            console.log(`PaymentRequest ${prId} marked paid, order updated`);
          }
        } catch (prErr) {
          console.error("Failed to update payment request:", prErr.message);
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
      let orderId = null;
      try {
        const sub = await stripe.subscriptions.retrieve(invoice.subscription);
        clubId = sub.metadata?.clubId;
        registrationId = sub.metadata?.registrationId;
        orderId = sub.metadata?.orderId;
      } catch (err) {
        console.error("Failed to retrieve subscription:", err.message);
      }

      if (!clubId) break;

      await Transaction.create({
        clubId,
        orderId: orderId || null,
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

      if (orderId && invoice.amount_paid > 0) {
        try {
          const order = await Order.findById(orderId);
          if (order) {
            order.paidCents = (order.paidCents || 0) + invoice.amount_paid;
            const installment = (order.installmentSchedule || []).find(
              (inst) => inst.stripeInvoiceId === invoice.id || inst.status === "pending"
            );
            if (installment) {
              installment.status = "paid";
              installment.paidAt = new Date();
              installment.stripeInvoiceId = invoice.id;
              installment.paymentMethod = "card";
            }
            order.status = order.paidCents >= order.totalCostCents ? "paid" : "partial";
            await order.save();
            console.log(`Order ${orderId} installment paid: ${invoice.amount_paid} cents`);
          }
        } catch (err) {
          console.error("Failed to update order installment:", err.message);
        }
      }

      console.log(`Installment payment recorded for club ${clubId}, invoice ${invoice.id}`);
      break;
    }

    case "invoice.payment_failed": {
      const invoice = event.data.object;
      if (!invoice.subscription) break;

      let registrationId = null;
      let orderId = null;
      try {
        const sub = await stripe.subscriptions.retrieve(invoice.subscription);
        registrationId = sub.metadata?.registrationId;
        orderId = sub.metadata?.orderId;
        if (registrationId) {
          await Registration.findByIdAndUpdate(registrationId, { status: "failed" });
        }
        if (orderId) {
          const order = await Order.findById(orderId);
          if (order) {
            const failedInst = (order.installmentSchedule || []).find((i) => i.status === "pending");
            if (failedInst) { failedInst.status = "failed"; await order.save(); }
          }
        }
      } catch (err) {
        console.error("Failed to update on payment failure:", err.message);
      }

      console.error(`Installment payment failed: invoice ${invoice.id}, subscription ${invoice.subscription}`);
      break;
    }

    case "customer.subscription.deleted": {
      const subscription = event.data.object;
      const registrationId = subscription.metadata?.registrationId;
      const orderId = subscription.metadata?.orderId;

      if (registrationId) {
        const reg = await Registration.findById(registrationId);
        if (reg && reg.status !== "completed") {
          const isComplete = reg.collectedCents >= reg.finalCostCents;
          await Registration.findByIdAndUpdate(registrationId, {
            status: isComplete ? "completed" : reg.status,
          });
        }
      }

      if (orderId) {
        try {
          const order = await Order.findById(orderId);
          if (order && order.status !== "paid") {
            order.status = order.paidCents >= order.totalCostCents ? "paid" : order.status;
            order.stripeSubscriptionId = "";
            await order.save();
          }
        } catch (err) {
          console.error("Failed to update order on subscription end:", err.message);
        }
      }

      console.log(`Subscription ${subscription.id} ended`);
      break;
    }

    default:
      console.log(`Unhandled event type: ${event.type}`);
  }

  return NextResponse.json({ received: true });
}
