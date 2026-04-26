import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import dbConnect from "@/lib/mongodb";
import User from "@/models/User";
import Club from "@/models/Club";
import Membership from "@/models/Membership";

const PASSWORD_REGEX = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^a-zA-Z0-9]).{8,}$/;
const USERNAME_REGEX = /^[a-z0-9_.-]{3,32}$/;

// GET — verify the token is still valid and return enough info to render the
// signup page (the email it was sent to + the inviting club's name).
export async function GET(_request, { params }) {
  const { token } = await params;
  if (!token) return NextResponse.json({ error: "Missing token" }, { status: 400 });

  await dbConnect();
  const user = await User.findOne({ signupToken: token }).lean();
  if (!user) {
    return NextResponse.json({ error: "Invalid or expired link" }, { status: 404 });
  }
  if (user.signupTokenExpiresAt && user.signupTokenExpiresAt < new Date()) {
    return NextResponse.json({ error: "Link has expired" }, { status: 410 });
  }

  const pendingMemberships = await Membership.find({
    userId: user._id,
    status: "pending_user",
  }).lean();
  const clubs = await Club.find({
    _id: { $in: pendingMemberships.map((m) => m.clubId) },
  })
    .select("name logoUrl")
    .lean();

  return NextResponse.json({
    email: user.email,
    pendingClubs: clubs.map((c) => ({ id: String(c._id), name: c.name, logoUrl: c.logoUrl || null })),
  });
}

// POST { username, password } — claim the account: set username + password,
// flip status from "pending" to "active", clear the token. The pending
// memberships stay in `pending_user` until the user explicitly accepts each
// one on the /invitations page.
export async function POST(request, { params }) {
  const { token } = await params;
  const { username, password } = await request.json();

  if (!username || !password) {
    return NextResponse.json({ error: "Username and password are required" }, { status: 400 });
  }
  if (!USERNAME_REGEX.test(username)) {
    return NextResponse.json(
      { error: "Username must be 3–32 chars, lowercase letters, digits, _ . -" },
      { status: 400 },
    );
  }
  if (!PASSWORD_REGEX.test(password)) {
    return NextResponse.json(
      { error: "Password must be at least 8 chars with upper, lower, number, and symbol" },
      { status: 400 },
    );
  }

  await dbConnect();
  const user = await User.findOne({ signupToken: token });
  if (!user) {
    return NextResponse.json({ error: "Invalid or expired link" }, { status: 404 });
  }
  if (user.signupTokenExpiresAt && user.signupTokenExpiresAt < new Date()) {
    return NextResponse.json({ error: "Link has expired" }, { status: 410 });
  }

  // Username uniqueness check (sparse-unique index would also catch this).
  const taken = await User.findOne({ username: username.toLowerCase() }).lean();
  if (taken && String(taken._id) !== String(user._id)) {
    return NextResponse.json({ error: "Username is already taken" }, { status: 409 });
  }

  user.username = username.toLowerCase();
  user.password = await bcrypt.hash(password, 12);
  user.temporaryPassword = null;
  user.mustChangePassword = false;
  user.status = "active";
  user.signupToken = null;
  user.signupTokenExpiresAt = null;
  await user.save();

  return NextResponse.json({ success: true, username: user.username });
}
