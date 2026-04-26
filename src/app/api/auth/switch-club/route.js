import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import dbConnect from "@/lib/mongodb";
import Membership from "@/models/Membership";
import User from "@/models/User";

// POST { clubId } — verify the requester has an active membership in `clubId`
// and persist `lastActiveClubId`. The actual JWT update happens client-side
// via `update({ activeClubId })` in next-auth — this endpoint only validates
// authorization and persists the choice for the next login.
export async function POST(request) {
  const session = await getServerSession(authOptions);
  if (!session || !session.user.userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { clubId } = await request.json();
  if (!clubId) {
    return NextResponse.json({ error: "Missing clubId" }, { status: 400 });
  }

  await dbConnect();
  const membership = await Membership.findOne({
    userId: session.user.userId,
    clubId,
    status: "active",
  }).lean();

  if (!membership) {
    return NextResponse.json(
      { error: "You don't have an active membership for this club" },
      { status: 403 },
    );
  }

  await User.findByIdAndUpdate(session.user.userId, { lastActiveClubId: clubId });

  return NextResponse.json({ success: true, clubId });
}
