import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import dbConnect from "@/lib/mongodb";
import Membership from "@/models/Membership";
import Club from "@/models/Club";

// Returns the requester's full membership history grouped by status. Pending
// invites show on a banner; deactivated/declined/left memberships still show
// on the user's "My Clubs" so they can see why they lost access.
async function _GET(req, res) {
  const session = await getServerSession(authOptions);
  if (!session || !session.user.userId) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  await dbConnect();
  const memberships = await Membership.find({ userId: session.user.userId })
    .sort({ updatedAt: -1 })
    .lean();
  if (memberships.length === 0) {
    return res.status(200).json({ memberships: [] });
  }

  const clubs = await Club.find({
    _id: { $in: memberships.map((m) => m.clubId) },
  })
    .select("name logoUrl")
    .lean();
  const clubById = Object.fromEntries(clubs.map((c) => [String(c._id), c]));

  return res.status(200).json({
    memberships: memberships.map((m) => ({
      id: String(m._id),
      clubId: String(m.clubId),
      clubName: clubById[String(m.clubId)]?.name || "",
      clubLogoUrl: clubById[String(m.clubId)]?.logoUrl || null,
      status: m.status,
      mainRole: m.mainRole,
      customRoleLabel: m.customRoleLabel,
      invitedAt: m.invitedAt,
      acceptedAt: m.acceptedAt,
      deactivatedAt: m.deactivatedAt,
    })),
  });
}
export default async function handler(req, res) {
  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });
  return _GET(req, res);
}
