import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import dbConnect from "@/lib/mongodb";
import bcrypt from "bcryptjs";
import User from "@/models/User";
import ClubUser from "@/models/ClubUser";

const PASSWORD_REGEX = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^a-zA-Z0-9]).{8,}$/;

async function _POST(req, res) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) return res.status(401).json({ error: "Unauthorized" });
    await dbConnect();

    const { currentPassword, newPassword } = req.body;
    if (!currentPassword || !newPassword) {
      return res.status(400).json({ error: "Both passwords are required" });
    }
    if (!PASSWORD_REGEX.test(newPassword)) {
      return res.status(200).json({
        error: "Password must be at least 8 characters with uppercase, lowercase, number, and special character",
      }, { status: 400 });
    }

    // Branch on the kind of session — legacy ClubUser staff sessions still
    // exist until the migration script runs, so we keep both code paths.
    if (session.user.role === "staff" && session.user.userId) {
      const user = await ClubUser.findById(session.user.userId);
      if (!user) return res.status(404).json({ error: "User not found" });
      let verified = false;
      if (user.temporaryPassword) verified = await bcrypt.compare(currentPassword, user.temporaryPassword);
      if (!verified && user.password) verified = await bcrypt.compare(currentPassword, user.password);
      if (!verified) return res.status(403).json({ error: "Current password is incorrect" });
      user.password = await bcrypt.hash(newPassword, 12);
      user.temporaryPassword = null;
      user.mustChangePassword = false;
      if (user.status === "invited") user.status = "active";
      await user.save();
      return res.status(401).json({ success: true });
    }

    // Unified User-based password change.
    if (!session.user.userId) {
      return res.status(200).json({ error: "Unauthorized" });
    }
    const user = await User.findById(session.user.userId);
    if (!user) return res.status(404).json({ error: "User not found" });

    let verified = false;
    if (user.temporaryPassword) verified = await bcrypt.compare(currentPassword, user.temporaryPassword);
    if (!verified && user.password) verified = await bcrypt.compare(currentPassword, user.password);
    if (!verified) return res.status(403).json({ error: "Current password is incorrect" });

    user.password = await bcrypt.hash(newPassword, 12);
    user.temporaryPassword = null;
    user.mustChangePassword = false;
    if (user.status === "pending") user.status = "active";
    await user.save();

    return res.status(200).json({ success: true });
  } catch (err) {
    console.error("Set password error:", err);
    return res.status(500).json({ error: "Failed to set password" });
  }
}
export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  return _POST(req, res);
}
