import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import dbConnect from "@/lib/mongodb";
import bcrypt from "bcryptjs";
import ClubUser from "@/models/ClubUser";

const PASSWORD_REGEX = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^a-zA-Z0-9]).{8,}$/;

export async function POST(request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session || session.user.role !== "staff") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
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

    const user = await ClubUser.findById(session.user.id);
    if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 });

    let verified = false;
    if (user.temporaryPassword) {
      verified = await bcrypt.compare(currentPassword, user.temporaryPassword);
    }
    if (!verified && user.password) {
      verified = await bcrypt.compare(currentPassword, user.password);
    }
    if (!verified) {
      return NextResponse.json({ error: "Current password is incorrect" }, { status: 403 });
    }

    user.password = await bcrypt.hash(newPassword, 12);
    user.temporaryPassword = null;
    user.mustChangePassword = false;
    if (user.status === "invited") user.status = "active";
    await user.save();

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Set password error:", error);
    return NextResponse.json({ error: "Failed to set password" }, { status: 500 });
  }
}
