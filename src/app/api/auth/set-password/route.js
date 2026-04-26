import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import dbConnect from "@/lib/mongodb";
import bcrypt from "bcryptjs";
import User from "@/models/User";
import ClubUser from "@/models/ClubUser";

const PASSWORD_REGEX = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^a-zA-Z0-9]).{8,}$/;

export async function POST(request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    await dbConnect();

    const { currentPassword, newPassword } = await request.json();
    if (!currentPassword || !newPassword) {
      return NextResponse.json({ error: "Both passwords are required" }, { status: 400 });
    }
    if (!PASSWORD_REGEX.test(newPassword)) {
      return NextResponse.json({
        error: "Password must be at least 8 characters with uppercase, lowercase, number, and special character",
      }, { status: 400 });
    }

    // Branch on the kind of session — legacy ClubUser staff sessions still
    // exist until the migration script runs, so we keep both code paths.
    if (session.user.role === "staff" && session.user.userId) {
      const user = await ClubUser.findById(session.user.userId);
      if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 });
      let verified = false;
      if (user.temporaryPassword) verified = await bcrypt.compare(currentPassword, user.temporaryPassword);
      if (!verified && user.password) verified = await bcrypt.compare(currentPassword, user.password);
      if (!verified) return NextResponse.json({ error: "Current password is incorrect" }, { status: 403 });
      user.password = await bcrypt.hash(newPassword, 12);
      user.temporaryPassword = null;
      user.mustChangePassword = false;
      if (user.status === "invited") user.status = "active";
      await user.save();
      return NextResponse.json({ success: true });
    }

    // Unified User-based password change.
    if (!session.user.userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const user = await User.findById(session.user.userId);
    if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 });

    let verified = false;
    if (user.temporaryPassword) verified = await bcrypt.compare(currentPassword, user.temporaryPassword);
    if (!verified && user.password) verified = await bcrypt.compare(currentPassword, user.password);
    if (!verified) return NextResponse.json({ error: "Current password is incorrect" }, { status: 403 });

    user.password = await bcrypt.hash(newPassword, 12);
    user.temporaryPassword = null;
    user.mustChangePassword = false;
    if (user.status === "pending") user.status = "active";
    await user.save();

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("Set password error:", err);
    return NextResponse.json({ error: "Failed to set password" }, { status: 500 });
  }
}
