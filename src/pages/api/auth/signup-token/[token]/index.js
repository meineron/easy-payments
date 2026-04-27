import bcrypt from "bcryptjs";
import dbConnect from "@/lib/mongodb";
import User from "@/models/User";
import Club from "@/models/Club";
import Membership from "@/models/Membership";

const PASSWORD_REGEX = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^a-zA-Z0-9]).{8,}$/;
const USERNAME_REGEX = /^[a-z0-9_.-]{3,32}$/;

// GET — verify the token is still valid and return enough info to render the
// signup page (the email it was sent to + the inviting club's name).
async function _GET(req, res) {
  const { token } = req.query;
  if (!token) return res.status(400).json({ error: "Missing token" });

  await dbConnect();
  const user = await User.findOne({ signupToken: token }).lean();
  if (!user) {
    return res.status(404).json({ error: "Invalid or expired link" });
  }
  if (user.signupTokenExpiresAt && user.signupTokenExpiresAt < new Date()) {
    return res.status(410).json({ error: "Link has expired" });
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

  return res.status(200).json({
    email: user.email,
    pendingClubs: clubs.map((c) => ({ id: String(c._id), name: c.name, logoUrl: c.logoUrl || null })),
  });
}

// POST { username, password } — claim the account: set username + password,
// flip status from "pending" to "active", clear the token. The pending
// memberships stay in `pending_user` until the user explicitly accepts each
// one on the /invitations page.
async function _POST(req, res) {
  const { token } = req.query;
  const { username, password } = req.body;

  if (!username || !password) {
    return res.status(400).json({ error: "Username and password are required" });
  }
  if (!USERNAME_REGEX.test(username)) {
    return res.status(200).json(
      { error: "Username must be 3–32 chars, lowercase letters, digits, _ . -" },
      { status: 400 },
    );
  }
  if (!PASSWORD_REGEX.test(password)) {
    return res.status(200).json(
      { error: "Password must be at least 8 chars with upper, lower, number, and symbol" },
      { status: 400 },
    );
  }

  await dbConnect();
  const user = await User.findOne({ signupToken: token });
  if (!user) {
    return res.status(404).json({ error: "Invalid or expired link" });
  }
  if (user.signupTokenExpiresAt && user.signupTokenExpiresAt < new Date()) {
    return res.status(410).json({ error: "Link has expired" });
  }

  // Username uniqueness check (sparse-unique index would also catch this).
  const taken = await User.findOne({ username: username.toLowerCase() }).lean();
  if (taken && String(taken._id) !== String(user._id)) {
    return res.status(409).json({ error: "Username is already taken" });
  }

  user.username = username.toLowerCase();
  user.password = await bcrypt.hash(password, 12);
  user.temporaryPassword = null;
  user.mustChangePassword = false;
  user.status = "active";
  user.signupToken = null;
  user.signupTokenExpiresAt = null;
  await user.save();

  return res.status(200).json({ success: true, username: user.username });
}
export default async function handler(req, res) {
  if (req.method === "GET") {
    return _GET(req, res);
  } else if (req.method === "POST") {
    return _POST(req, res);
  } else {
    return res.status(405).json({ error: "Method not allowed" });
  }
}
