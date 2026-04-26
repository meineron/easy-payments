import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import dbConnect from "@/lib/mongodb";
import Membership from "@/models/Membership";
import User from "@/models/User";

// PATCH { action: "accept" | "decline" | "leave" }
//
// Transitions the requester's own membership document.
//   accept  : pending_user -> active   (requires status === "pending_user")
//   decline : pending_user -> declined (requires status === "pending_user")
//   leave   : active        -> left    (requires status === "active")
//
// "deactivated" is a club-side action and lives on the staff CRUD endpoint.
export async function PATCH(request, { params }) {
  const session = await getServerSession(authOptions);
  if (!session || !session.user.userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const { action } = await request.json();
  if (!["accept", "decline", "leave"].includes(action)) {
    return NextResponse.json({ error: "Invalid action" }, { status: 400 });
  }

  await dbConnect();
  const membership = await Membership.findOne({ _id: id, userId: session.user.userId });
  if (!membership) {
    return NextResponse.json({ error: "Invitation not found" }, { status: 404 });
  }

  const now = new Date();
  if (action === "accept") {
    if (membership.status !== "pending_user") {
      return NextResponse.json({ error: "This invitation can no longer be accepted" }, { status: 409 });
    }
    membership.status = "active";
    membership.acceptedAt = now;
    membership.lastChangedBy = String(session.user.userId);
    await membership.save();

    // First time accepting? Make this their active club so the next page load
    // lands them on the club's dashboard without an extra step.
    const user = await User.findById(session.user.userId);
    if (user && !user.lastActiveClubId) {
      user.lastActiveClubId = membership.clubId;
      await user.save();
    }
  } else if (action === "decline") {
    if (membership.status !== "pending_user") {
      return NextResponse.json({ error: "This invitation can no longer be declined" }, { status: 409 });
    }
    membership.status = "declined";
    membership.lastChangedBy = String(session.user.userId);
    await membership.save();
  } else if (action === "leave") {
    if (membership.status !== "active") {
      return NextResponse.json({ error: "Only active memberships can be left" }, { status: 409 });
    }
    membership.status = "left";
    membership.lastChangedBy = String(session.user.userId);
    await membership.save();
  }

  return NextResponse.json({ success: true, status: membership.status });
}
