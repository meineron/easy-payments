import { NextResponse } from "next/server";
import dbConnect from "@/lib/mongodb";
import { stripe } from "@/lib/stripe";
import Club from "@/models/Club";

export async function GET(request, { params }) {
  const { id } = await params;

  await dbConnect();
  const club = await Club.findById(id).select("-password -stripeSecretKey -stripeWebhookSecret");

  if (!club) {
    return NextResponse.json({ error: "Club not found" }, { status: 404 });
  }

  const secrets = await Club.findById(id).select("stripeSecretKey stripeWebhookSecret");
  const hasKey = !!secrets?.stripeSecretKey;
  const hasWebhookSecret = !!secrets?.stripeWebhookSecret;

  return NextResponse.json({
    club: { ...club.toObject(), hasStripeKey: hasKey, hasWebhookSecret },
  });
}

export async function PUT(request, { params }) {
  const { id } = await params;

  try {
    const body = await request.json();
    const { name, hasDirectStripeAccess, stripeSecretKey, stripeWebhookSecret } = body;

    await dbConnect();
    const club = await Club.findById(id);

    if (!club) {
      return NextResponse.json({ error: "Club not found" }, { status: 404 });
    }

    if (club.onboardingComplete && !club.hasDirectStripeAccess) {
      return NextResponse.json(
        { error: "Cannot change Stripe status — this club has already completed Connect onboarding" },
        { status: 400 }
      );
    }

    if (name) club.name = name;

    const wasDirectAccess = club.hasDirectStripeAccess;
    const wantDirectAccess = !!hasDirectStripeAccess;

    if (wasDirectAccess && !wantDirectAccess) {
      // Switching from Direct Access → Connect: create a new Express account
      const account = await stripe.accounts.create({
        type: "express",
        metadata: { clubName: club.name },
      });

      club.hasDirectStripeAccess = false;
      club.stripeSecretKey = null;
      club.stripeWebhookSecret = null;
      club.stripeAccountId = account.id;
      club.onboardingComplete = false;
    } else if (!wasDirectAccess && wantDirectAccess) {
      // Switching from Connect → Direct Access: delete the Express account
      if (!stripeSecretKey) {
        return NextResponse.json(
          { error: "Stripe secret key is required when enabling direct access" },
          { status: 400 }
        );
      }

      if (club.stripeAccountId) {
        try {
          await stripe.accounts.del(club.stripeAccountId);
        } catch (err) {
          console.error("Failed to delete Stripe account (may already be gone):", err.message);
        }
      }

      club.hasDirectStripeAccess = true;
      club.stripeSecretKey = stripeSecretKey;
      if (typeof stripeWebhookSecret === "string" && stripeWebhookSecret.trim()) {
        club.stripeWebhookSecret = stripeWebhookSecret.trim();
      }
      club.stripeAccountId = null;
      club.onboardingComplete = true;
    } else if (wantDirectAccess && wasDirectAccess) {
      // Staying on Direct Access — update the key/webhook secret if provided
      if (stripeSecretKey) {
        club.stripeSecretKey = stripeSecretKey;
      }
      if (typeof stripeWebhookSecret === "string" && stripeWebhookSecret.trim()) {
        club.stripeWebhookSecret = stripeWebhookSecret.trim();
      }
    }

    await club.save();

    return NextResponse.json({
      club: {
        _id: club._id,
        name: club.name,
        username: club.username,
        stripeAccountId: club.stripeAccountId,
        hasDirectStripeAccess: club.hasDirectStripeAccess,
        onboardingComplete: club.onboardingComplete,
        hasWebhookSecret: !!club.stripeWebhookSecret,
      },
    });
  } catch (error) {
    console.error("Update club error:", error);
    return NextResponse.json({ error: "Failed to update club" }, { status: 500 });
  }
}
