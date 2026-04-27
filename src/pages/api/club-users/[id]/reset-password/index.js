import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import dbConnect from "@/lib/mongodb";
import bcrypt from "bcryptjs";
import crypto from "crypto";
import Membership from "@/models/Membership";
import User from "@/models/User";
import Club from "@/models/Club";
import { sendStaffResetPasswordEmail } from "@/lib/email";

function generateTempPassword() {
  const upper = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
  const lower = "abcdefghijklmnopqrstuvwxyz";
  const digits = "0123456789";
  const special = "!@#$%&*";
  const all = upper + lower + digits + special;
  const pass = [
    upper[crypto.randomInt(upper.length)],
    lower[crypto.randomInt(lower.length)],
    digits[crypto.randomInt(digits.length)],
    special[crypto.randomInt(special.length)],
  ];
  for (let i = 4; i < 10; i++) {
    pass.push(all[crypto.randomInt(all.length)]);
  }
  for (let i = pass.length - 1; i > 0; i--) {
    const j = crypto.randomInt(i + 1);
    [pass[i], pass[j]] = [pass[j], pass[i]];
  }
  return pass.join("");
}

// Reset the user's password globally (it's a User-level concept now, not
// per-club). Only members of THIS club can trigger it for THIS user, and only
// if the user has an active or pending membership here. We never expose the
// existence of other clubs the user might belong to.
async function _POST(req, res) {
  try {
    const session = await getServerSession(authOptions);
    if (!session || session.user.role !== "club") {
      return res.status(401).json({ error: "Unauthorized" });
    }
    const clubId = session.user.activeClubId || session.user.id;
    await dbConnect();
    const { id } = req.query;

    const membership = await Membership.findOne({ _id: id, clubId });
    if (!membership) return res.status(404).json({ error: "User not found" });

    const user = await User.findById(membership.userId);
    if (!user) return res.status(404).json({ error: "User not found" });

    const tempPassword = generateTempPassword();
    user.temporaryPassword = await bcrypt.hash(tempPassword, 12);
    user.mustChangePassword = true;
    await user.save();

    const club = await Club.findById(clubId).select("name logoUrl language").lean();
    const baseUrl = process.env.NEXTAUTH_URL || "http://localhost:3000";

    await sendStaffResetPasswordEmail(user.email, {
      staffName: `${user.firstName} ${user.lastName}`.trim() || user.email,
      clubName: club?.name || "Club",
      temporaryPassword: tempPassword,
      loginUrl: baseUrl,
      logoUrl: club?.logoUrl || null,
      locale: user.language || club?.language || "en",
    });

    return res.status(200).json({ success: true });
  } catch (err) {
    console.error("Reset password error:", err);
    return res.status(500).json({ error: "Failed to reset password" });
  }
}
export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  return _POST(req, res);
}
