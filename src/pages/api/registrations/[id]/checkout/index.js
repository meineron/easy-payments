import { stripe } from "@/lib/stripe";
import { connectMain } from "@/lib/mongodb";
import { resolvePublicContext, dualWrite } from "@/lib/club-context";
import Club from "@/models/Club";

async function _POST(req, res) {
  try {
    const { id } = req.query;
    const { numPayments } = req.body;

    const ctx = await resolvePublicContext("registration", id);
    if (!ctx) {
      return res.status(404).json({ error: "Registration not found" });
    }
    const { Registration, Team } = ctx.models;

    const reg = await Registration.findById(id);
    if (!reg) {
      return res.status(404).json({ error: "Registration not found" });
    }
    if (reg.status === "completed" || reg.status === "active") {
      return res.status(400).json({ error: "This registration is already paid" });
    }

    const team = await Team.findById(reg.teamId);
    if (!team) {
      return res.status(404).json({ error: "Team not found" });
    }

    await connectMain();
    const club = await Club.findById(reg.clubId);
    if (!club || !club.onboardingComplete || !club.stripeAccountId) {
      return res.status(400).json({ error: "Club Stripe account not ready" });
    }

    const payments = numPayments || reg.numPayments;
    if (payments !== reg.numPayments) {
      await dualWrite(ctx, (M) => M.Registration.findByIdAndUpdate(id, { numPayments: payments }));
    }

    const totalCents = reg.subscriptionCostCents;
    const discountCents = reg.discountCents;
    const afterDiscountCents = reg.finalCostCents;
    const hasLoyaltyDiscount = reg.hasLoyaltyDiscount;

    let session;
    if (payments === 1) {
      session = await createSingleSession({ team, club, totalCents, afterDiscountCents, discountCents, hasLoyaltyDiscount, reg });
    } else {
      session = await createInstallmentSession({ team, club, afterDiscountCents, hasLoyaltyDiscount, payments, reg });
    }

    await dualWrite(ctx, (M) => M.Registration.findByIdAndUpdate(id, { stripeSessionId: session.id, status: "pending" }));

    return res.status(200).json({ url: session.url });
  } catch (error) {
    console.error("Registration checkout error:", error);
    return res.status(500).json({ error: "Failed to create checkout session" });
  }
}

async function createSingleSession({ team, club, totalCents, afterDiscountCents, discountCents, hasLoyaltyDiscount, reg }) {
  let discounts = [];
  if (hasLoyaltyDiscount && discountCents > 0) {
    const coupon = await stripe.coupons.create({
      amount_off: discountCents,
      currency: "usd",
      duration: "once",
      name: `Loyalty Discount ($${(discountCents / 100).toFixed(2)})`,
    });
    discounts = [{ coupon: coupon.id }];
  }

  const applicationFee = Math.round(afterDiscountCents * 0.02);

  return stripe.checkout.sessions.create({
    mode: "payment",
    line_items: [{
      price_data: {
        currency: "usd",
        product_data: {
          name: `Season ${team.season} Registration - ${team.name}`,
          description: `Registration fee for ${club.name} - ${team.name}`,
        },
        unit_amount: totalCents,
      },
      quantity: 1,
    }],
    discounts,
    payment_intent_data: {
      application_fee_amount: Math.max(applicationFee, 50),
      transfer_data: { destination: club.stripeAccountId },
    },
    customer_email: reg.parentEmail,
    invoice_creation: {
      enabled: true,
      invoice_data: {
        description: `${club.name} - Season ${team.season} Registration for ${team.name}`,
        metadata: { clubId: club._id.toString(), teamId: team._id.toString(), registrationId: reg._id.toString() },
        custom_fields: [
          { name: "Club", value: club.name },
          { name: "Team", value: team.name },
          { name: "Season", value: team.season },
          { name: "Player", value: `${reg.playerFirstName} ${reg.playerLastName}` },
        ],
      },
    },
    metadata: { clubId: club._id.toString(), teamId: team._id.toString(), registrationId: reg._id.toString(), type: "single_payment" },
    success_url: `${process.env.NEXTAUTH_URL}/payment/success?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${process.env.NEXTAUTH_URL}/payment/cancel`,
  });
}

async function createInstallmentSession({ team, club, afterDiscountCents, hasLoyaltyDiscount, payments, reg }) {
  const firstPaymentCents = Math.round(afterDiscountCents * 0.10);
  const remainingCents = afterDiscountCents - firstPaymentCents;
  const installmentCents = Math.floor(remainingCents / (payments - 1));

  const nowMs = Date.now();
  const nowTs = Math.floor(nowMs / 1000);
  const activityStartTs = Math.floor(new Date(team.activityStartDate).getTime() / 1000);
  const oneMonthFromNowTs = Math.floor(new Date(new Date().getFullYear(), new Date().getMonth() + 1, new Date().getDate()).getTime() / 1000);
  const minTrialEnd = nowTs + (48 * 60 * 60);
  const trialEnd = Math.max(activityStartTs > nowTs ? activityStartTs : oneMonthFromNowTs, minTrialEnd);
  const cancelAt = trialEnd + ((payments - 1) * 30 * 24 * 60 * 60);

  return stripe.checkout.sessions.create({
    mode: "subscription",
    customer_email: reg.parentEmail,
    line_items: [
      {
        price_data: {
          currency: "usd",
          product_data: {
            name: `Season ${team.season} - ${team.name} (First Payment - 10%)`,
            description: `Deposit for ${club.name} - ${team.name} | Player: ${reg.playerFirstName} ${reg.playerLastName}`,
          },
          unit_amount: firstPaymentCents,
        },
        quantity: 1,
      },
      {
        price_data: {
          currency: "usd",
          product_data: {
            name: `Season ${team.season} - ${team.name} (Monthly Installment)`,
            description: `Monthly payment for ${club.name} - ${team.name} (${payments - 1} payments)`,
          },
          unit_amount: installmentCents,
          recurring: { interval: "month" },
        },
        quantity: 1,
      },
    ],
    subscription_data: {
      trial_end: trialEnd,
      application_fee_percent: 2,
      transfer_data: { destination: club.stripeAccountId },
      metadata: {
        clubId: club._id.toString(),
        teamId: team._id.toString(),
        registrationId: reg._id.toString(),
        teamName: team.name,
        season: team.season,
        totalPayments: payments.toString(),
        hasLoyaltyDiscount: hasLoyaltyDiscount.toString(),
        cancelAt: cancelAt.toString(),
      },
    },
    metadata: { clubId: club._id.toString(), teamId: team._id.toString(), registrationId: reg._id.toString(), type: "installment" },
    success_url: `${process.env.NEXTAUTH_URL}/payment/success?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${process.env.NEXTAUTH_URL}/payment/cancel`,
  });
}
export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  return _POST(req, res);
}
