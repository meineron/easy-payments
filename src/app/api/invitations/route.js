import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import dbConnect from "@/lib/mongodb";
import Membership from "@/models/Membership";
import Club from "@/models/Club";

// Returns the requester's full membership history grouped by status. Pending
// invites show on a banner; deactivated/declined/left memberships still show
// on the user's "My Clubs" so they can see why they lost access.
export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session || !session.user.userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  await dbConnect();
  const memberships = await Membership.find({ userId: session.user.userId })
    .sort({ updatedAt: -1 })
    .lean();
  if (memberships.length === 0) {
    return NextResponse.json({ memberships: [] });
  }

  const clubs = await Club.find({
    _id: { $in: memberships.map((m) => m.clubId) },
  })
    .select("name logoUrl")
    .lean();
  const clubById = Object.fromEntries(clubs.map((c) => [String(c._id), c]));

  return NextResponse.json({
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
