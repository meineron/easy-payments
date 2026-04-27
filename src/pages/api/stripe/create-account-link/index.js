import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { stripe } from "@/lib/stripe";
import { connectMain } from "@/lib/mongodb";
import Club from "@/models/Club";

async function _POST(req, res) {
  try {
    const session = await getServerSession(authOptions);

    if (!session || session.user.role !== "club") {
      return res.status(401).json({ error: "Unauthorized" });
    }

    await connectMain();
    const club = await Club.findById(session.user.activeClubId || session.user.id);

    if (!club || !club.stripeAccountId) {
      return res.status(400).json({ error: "Club not found or no Stripe account" });
    }

    const accountLink = await stripe.accountLinks.create({
      account: club.stripeAccountId,
      refresh_url: `${process.env.NEXTAUTH_URL}/dashboard?refresh=true`,
      return_url: `${process.env.NEXTAUTH_URL}/dashboard?onboarding=complete`,
      type: "account_onboarding",
    });

    return res.status(200).json({ url: accountLink.url });
  } catch (error) {
    console.error("Create account link error:", error);
    return res.status(500).json({ error: "Failed to create onboarding link" });
  }
}
export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  return _POST(req, res);
}
