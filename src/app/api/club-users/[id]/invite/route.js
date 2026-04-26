import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import dbConnect from "@/lib/mongodb";
import crypto from "crypto";
import Membership from "@/models/Membership";
import User from "@/models/User";
import Club from "@/models/Club";
import { sendStaffInviteEmail } from "@/lib/email";

const SIGNUP_TOKEN_TTL_MS = 1000 * 60 * 60 * 24 * 14; // 14 days

// (Re)send an invitation email for a Membership.
//
// Two flavors, picked based on whether the underlying User can already log in:
//
// 1. User has no password (`status === "pending"` and no password/temporaryPassword)
//    → generate a one-time signup token, link to /signup?token=...
//      The link lets the recipient pick their own username + password, then
//      lands on /invitations to explicitly accept.
//
// 2. User has a password already (existing platform user invited to a NEW club)
//    → no token; email tells them to log in and visit /invitations to
//      accept the invite for this club.
export async function POST(_request, { params }) {
  try {
    const session = await getServerSession(authOptions);
    if (!session || session.user.role !== "club") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const clubId = session.user.activeClubId || session.user.id;
    await dbConnect();
    const { id } = await params;

    const membership = await Membership.findOne({ _id: id, clubId });
    if (!membership) return NextResponse.json({ error: "User not found" }, { status: 404 });

    const user = await User.findById(membership.userId);
    if (!user || !user.email) {
      return NextResponse.json({ error: "Invitee has no email on file" }, { status: 400 });
    }

    // Re-issue pending_user when re-inviting a previously declined/left member.
    if (membership.status === "declined" || membership.status === "left") {
      membership.status = "pending_user";
    }
    membership.invitedAt = new Date();
    membership.lastChangedBy = String(session.user.userId || clubId);
    await membership.save();

    const club = await Club.findById(clubId).select("name logoUrl language").lean();
    const baseUrl = process.env.NEXTAUTH_URL || "http://localhost:3000";

    let loginUrl;
    let temporaryPassword = null;
    const needsCredentials = !user.password && !user.temporaryPassword;

    if (needsCredentials) {
      const token = crypto.randomBytes(32).toString("hex");
      user.signupToken = token;
      user.signupTokenExpiresAt = new Date(Date.now() + SIGNUP_TOKEN_TTL_MS);
      user.status = "pending";
      await user.save();
      loginUrl = `${baseUrl}/signup?token=${token}`;
    } else {
      // User already has credentials — point them at the invitations page
      // after they log in. We still pass `temporaryPassword: ""` to keep the
      // existing email template happy; the template's "credentials" block
      // will simply show their email.
      loginUrl = `${baseUrl}/invitations`;
    }

    await sendStaffInviteEmail(user.email, {
      staffName: `${user.firstName} ${user.lastName}`.trim() || user.email,
      clubName: club?.name || "Club",
      email: user.email,
      temporaryPassword: temporaryPassword ?? (needsCredentials ? "(set on signup page)" : "(use your existing password)"),
      loginUrl,
      logoUrl: club?.logoUrl || null,
      locale: user.language || club?.language || "en",
    });

    return NextResponse.json({ success: true, invitedAt: membership.invitedAt });
  } catch (err) {
    console.error("Invite club user error:", err);
    return NextResponse.json({ error: "Failed to send invite" }, { status: 500 });
  }
}
