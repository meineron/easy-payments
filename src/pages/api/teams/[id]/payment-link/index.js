import { stripe } from "@/lib/stripe";
import { connectMain } from "@/lib/mongodb";
import { resolvePublicContext, dualCreate, dualWrite } from "@/lib/club-context";
import Club from "@/models/Club";
import { toDobString } from "@/lib/dob";

async function _POST(req, res) {
  try {
    const { id } = req.query;
    const {
      numPayments,
      hasLoyaltyDiscount,
      parentId,
      parentFirstName,
      parentLastName,
      parentEmail,
      parentPhonePrefix,
      parentPhone,
      playerFirstName,
      playerLastName,
      playerAddress,
      playerCity,
      playerState,
      playerZip,
      playerDob,
    } = req.body;

    if (!numPayments || numPayments < 1 || numPayments > 12) {
      return res.status(400).json({ error: "Number of payments must be between 1 and 12" });
    }
    if (!parentFirstName || !parentLastName || !parentEmail || !parentPhone) {
      return res.status(200).json({ error: "Parent first name, last name, email, and phone are required" }, { status: 400 });
    }
    if (!playerFirstName || !playerLastName || !playerAddress || !playerCity || !playerState || !playerZip) {
      return res.status(200).json({ error: "Player first name, last name, and full address are required" }, { status: 400 });
    }

    const ctx = await resolvePublicContext("team", id);
    if (!ctx) {
      return res.status(404).json({ error: "Team not found" });
    }
    const { Team } = ctx.models;

    const team = await Team.findById(id);
    if (!team) {
      return res.status(404).json({ error: "Team not found" });
    }

    await connectMain();
    const club = await Club.findById(team.clubId);
    if (!club || !club.onboardingComplete || !club.stripeAccountId) {
      return res.status(400).json({ error: "Club Stripe account not ready" });
    }

    const totalCents = team.costCents;
    const discountCents = hasLoyaltyDiscount ? (team.loyaltyDiscountCents || 0) : 0;
    const afterDiscountCents = totalCents - discountCents;

    const registration = await dualCreate(ctx, "Registration", {
      clubId: club._id,
      teamId: team._id,
      parentId: parentId || null,
      parentFirstName: parentFirstName.trim(),
      parentLastName: parentLastName.trim(),
      parentEmail: parentEmail.trim(),
      parentPhonePrefix: (parentPhonePrefix || "+1").trim(),
      parentPhone: parentPhone.trim(),
      playerFirstName: playerFirstName.trim(),
      playerLastName: playerLastName.trim(),
      playerAddress: playerAddress.trim(),
      playerCity: playerCity.trim(),
      playerState: playerState.trim(),
      playerZip: playerZip.trim(),
      playerDob: toDobString(playerDob),
      subscriptionCostCents: totalCents,
      discountCents,
      finalCostCents: afterDiscountCents,
      hasLoyaltyDiscount: !!hasLoyaltyDiscount,
      numPayments,
      status: "pending",
    });

    if (parentId) {
      try {
        await dualWrite(ctx, (M) => M.Parent.findByIdAndUpdate(parentId, {
          $push: {
            players: {
              firstName: playerFirstName.trim(),
              lastName: playerLastName.trim(),
              dateOfBirth: toDobString(playerDob),
              address: playerAddress.trim(),
              city: playerCity.trim(),
              state: playerState.trim(),
              zip: playerZip.trim(),
              mainTeam: team._id,
            },
          },
        }));
      } catch (err) {
        console.error("Failed to add player to parent:", err.message);
      }
    }

    let session;
    if (numPayments === 1) {
      session = await createSinglePaymentSession({ team, club, afterDiscountCents, totalCents, discountCents, hasLoyaltyDiscount, registration });
    } else {
      session = await createInstallmentSession({ team, club, afterDiscountCents, totalCents, hasLoyaltyDiscount, numPayments, registration });
    }

    await dualWrite(ctx, (M) => M.Registration.findByIdAndUpdate(registration._id, { stripeSessionId: session.id }));

    return res.status(200).json({ url: session.url });
  } catch (error) {
    console.error("Create payment link error:", error);
    return res.status(500).json({ error: "Failed to create payment link" });
  }
}

async function createSinglePaymentSession({ team, club, afterDiscountCents, totalCents, discountCents, hasLoyaltyDiscount, registration }) {
  const lineItems = [{
    price_data: {
      currency: "usd",
      product_data: {
        name: `Season ${team.season} Registration - ${team.name}`,
        description: `Registration fee for ${club.name} - ${team.name}`,
      },
      unit_amount: totalCents,
    },
    quantity: 1,
  }];

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
    line_items: lineItems,
    discounts,
    payment_intent_data: {
      application_fee_amount: Math.max(applicationFee, 50),
      transfer_data: { destination: club.stripeAccountId },
    },
    customer_email: registration.parentEmail,
    invoice_creation: {
      enabled: true,
      invoice_data: {
        description: `${club.name} - Season ${team.season} Registration for ${team.name}`,
        metadata: {
          clubId: club._id.toString(),
          teamId: team._id.toString(),
          registrationId: registration._id.toString(),
        },
        custom_fields: [
          { name: "Club", value: club.name },
          { name: "Team", value: team.name },
          { name: "Season", value: team.season },
          { name: "Player", value: `${registration.playerFirstName} ${registration.playerLastName}` },
        ],
      },
    },
    metadata: {
      clubId: club._id.toString(),
      teamId: team._id.toString(),
      registrationId: registration._id.toString(),
      type: "single_payment",
    },
    success_url: `${process.env.NEXTAUTH_URL}/payment/success?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${process.env.NEXTAUTH_URL}/payment/cancel`,
  });
}

async function createInstallmentSession({ team, club, afterDiscountCents, totalCents, hasLoyaltyDiscount, numPayments, registration }) {
  const firstPaymentCents = Math.round(afterDiscountCents * 0.10);
  const remainingCents = afterDiscountCents - firstPaymentCents;
  const installmentCents = Math.floor(remainingCents / (numPayments - 1));

  const nowMs = Date.now();
  const nowTs = Math.floor(nowMs / 1000);
  const activityStartTs = Math.floor(new Date(team.activityStartDate).getTime() / 1000);
  const oneMonthFromNowTs = Math.floor(new Date(new Date().getFullYear(), new Date().getMonth() + 1, new Date().getDate()).getTime() / 1000);
  const minTrialEnd = nowTs + (48 * 60 * 60);
  const trialEnd = Math.max(activityStartTs > nowTs ? activityStartTs : oneMonthFromNowTs, minTrialEnd);
  const cancelAt = trialEnd + ((numPayments - 1) * 30 * 24 * 60 * 60);

  return stripe.checkout.sessions.create({
    mode: "subscription",
    customer_email: registration.parentEmail,
    line_items: [
      {
        price_data: {
          currency: "usd",
          product_data: {
            name: `Season ${team.season} - ${team.name} (First Payment - 10%)`,
            description: `Deposit for ${club.name} - ${team.name} | Player: ${registration.playerFirstName} ${registration.playerLastName}`,
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
            description: `Monthly payment for ${club.name} - ${team.name} (${numPayments - 1} payments)`,
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
        registrationId: registration._id.toString(),
        teamName: team.name,
        season: team.season,
        totalPayments: numPayments.toString(),
        hasLoyaltyDiscount: hasLoyaltyDiscount.toString(),
        cancelAt: cancelAt.toString(),
      },
    },
    metadata: {
      clubId: club._id.toString(),
      teamId: team._id.toString(),
      registrationId: registration._id.toString(),
      type: "installment",
    },
    success_url: `${process.env.NEXTAUTH_URL}/payment/success?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${process.env.NEXTAUTH_URL}/payment/cancel`,
  });
}
export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  return _POST(req, res);
}
