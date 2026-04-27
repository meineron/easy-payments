import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import dbConnect from "@/lib/mongodb";
import Membership from "@/models/Membership";
import User from "@/models/User";

// POST { clubId } — verify the requester has an active membership in `clubId`
// and persist `lastActiveClubId`. The actual JWT update happens client-side
// via `update({ activeClubId })` in next-auth — this endpoint only validates
// authorization and persists the choice for the next login.
async function _POST(req, res) {
  const session = await getServerSession(authOptions);
  if (!session || !session.user.userId) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  const { clubId } = req.body;
  if (!clubId) {
    return res.status(400).json({ error: "Missing clubId" });
  }

  await dbConnect();
  const membership = await Membership.findOne({
    userId: session.user.userId,
    clubId,
    status: "active",
  }).lean();

  if (!membership) {
    return res.status(200).json(
      { error: "You don't have an active membership for this club" },
      { status: 403 },
    );
  }

  await User.findByIdAndUpdate(session.user.userId, { lastActiveClubId: clubId });

  return res.status(200).json({ success: true, clubId });
}
export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  return _POST(req, res);
}
