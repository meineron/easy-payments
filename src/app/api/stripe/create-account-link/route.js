import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { stripe } from "@/lib/stripe";
import dbConnect from "@/lib/mongodb";
import Club from "@/models/Club";

export async function POST() {
  try {
    const session = await getServerSession(authOptions);

    if (!session || session.user.role !== "club") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    await dbConnect();
    const club = await Club.findById(session.user.id);

    if (!club || !club.stripeAccountId) {
      return NextResponse.json({ error: "Club not found or no Stripe account" }, { status: 400 });
    }

    const accountLink = await stripe.accountLinks.create({
      account: club.stripeAccountId,
      refresh_url: `${process.env.NEXTAUTH_URL}/dashboard?refresh=true`,
      return_url: `${process.env.NEXTAUTH_URL}/dashboard?onboarding=complete`,
      type: "account_onboarding",
    });

    return NextResponse.json({ url: accountLink.url });
  } catch (error) {
    console.error("Create account link error:", error);
    return NextResponse.json({ error: "Failed to create onboarding link" }, { status: 500 });
  }
}
