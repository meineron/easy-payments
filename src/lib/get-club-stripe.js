import Stripe from "stripe";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import dbConnect from "@/lib/mongodb";
import Club from "@/models/Club";

/**
 * Resolves the Stripe client for a club with hasDirectStripeAccess.
 * Returns the Stripe instance using the club's stored secret key from DB.
 * Returns null if the club doesn't have direct access or no key is found.
 */
export async function getClubStripe(clubId) {
  const session = await getServerSession(authOptions);
  if (!session) return null;

  const targetClubId = clubId || (session.user.role === "club" ? session.user.id : null);

  if (!targetClubId) return null;

  await dbConnect();
  const club = await Club.findById(targetClubId).select("hasDirectStripeAccess stripeSecretKey");

  if (club?.hasDirectStripeAccess && club?.stripeSecretKey) {
    return new Stripe(club.stripeSecretKey);
  }

  return null;
}
