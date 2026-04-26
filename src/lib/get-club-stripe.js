import Stripe from "stripe";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { connectMain } from "@/lib/mongodb";
import Club from "@/models/Club";

/**
 * Resolves the Stripe client for a club with hasDirectStripeAccess.
 * Returns the Stripe instance using the club's stored secret key from DB.
 * Returns null if the club doesn't have direct access or no key is found.
 */
export async function getClubStripe(clubId) {
  const session = await getServerSession(authOptions);
  if (!session) return null;

  const sessionClubId = session.user.role === "club"
    ? (session.user.activeClubId || session.user.id)
    : null;
  const targetClubId = clubId || sessionClubId;

  if (!targetClubId) return null;

  await connectMain();
  const club = await Club.findById(targetClubId).select("hasDirectStripeAccess stripeSecretKey");

  if (club?.hasDirectStripeAccess && club?.stripeSecretKey) {
    return new Stripe(club.stripeSecretKey);
  }

  return null;
}
