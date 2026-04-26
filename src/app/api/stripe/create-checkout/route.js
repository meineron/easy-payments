import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { stripe } from "@/lib/stripe";
import { connectMain } from "@/lib/mongodb";
import Club from "@/models/Club";

export async function POST() {
  try {
    const session = await getServerSession(authOptions);

    if (!session || session.user.role !== "club") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    await connectMain();
    const club = await Club.findById(session.user.activeClubId || session.user.id);

    if (!club || !club.onboardingComplete) {
      return NextResponse.json({ error: "Complete Stripe onboarding first" }, { status: 400 });
    }

    const checkoutSession = await stripe.checkout.sessions.create({
      mode: "payment",
      line_items: [
        {
          price_data: {
            currency: "usd",
            product_data: {
              name: "Club Service Fee",
              description: `Payment for ${club.name}`,
            },
            unit_amount: 1000,
          },
          quantity: 1,
        },
      ],
      payment_intent_data: {
        application_fee_amount: 100,
        transfer_data: {
          destination: club.stripeAccountId,
        },
      },
      invoice_creation: {
        enabled: true,
        invoice_data: {
          description: `Invoice for ${club.name} - Club Service Fee`,
          metadata: {
            clubId: club._id.toString(),
            clubName: club.name,
          },
          custom_fields: [
            { name: "Club", value: club.name },
          ],
        },
      },
      metadata: {
        clubId: club._id.toString(),
      },
      success_url: `${process.env.NEXTAUTH_URL}/payment/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${process.env.NEXTAUTH_URL}/payment/cancel`,
    });

    return NextResponse.json({ url: checkoutSession.url });
  } catch (error) {
    console.error("Create checkout error:", error);
    return NextResponse.json({ error: "Failed to create checkout session" }, { status: 500 });
  }
}
