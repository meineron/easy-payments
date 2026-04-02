import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { stripe } from "@/lib/stripe";
import dbConnect from "@/lib/mongodb";
import Club from "@/models/Club";

export async function GET() {
  try {
    const session = await getServerSession(authOptions);

    if (!session || session.user.role !== "club") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    await dbConnect();
    const club = await Club.findById(session.user.id);

    if (!club || !club.stripeAccountId) {
      return NextResponse.json({ onboardingComplete: false });
    }

    const account = await stripe.accounts.retrieve(club.stripeAccountId);

    const isComplete = account.details_submitted && account.charges_enabled;

    if (isComplete && !club.onboardingComplete) {
      club.onboardingComplete = true;
      await club.save();
    }

    return NextResponse.json({
      onboardingComplete: isComplete,
      chargesEnabled: account.charges_enabled,
      detailsSubmitted: account.details_submitted,
    });
  } catch (error) {
    console.error("Account status error:", error);
    return NextResponse.json({ error: "Failed to check status" }, { status: 500 });
  }
}
