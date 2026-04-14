import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import dbConnect from "@/lib/mongodb";
import bcrypt from "bcryptjs";
import crypto from "crypto";
import ClubUser from "@/models/ClubUser";
import Club from "@/models/Club";
import { sendStaffResetPasswordEmail } from "@/lib/email";

function generateTempPassword() {
  const upper = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
  const lower = "abcdefghijklmnopqrstuvwxyz";
  const digits = "0123456789";
  const special = "!@#$%&*";
  const all = upper + lower + digits + special;
  let pass = [
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

export async function POST(request, { params }) {
  try {
    const session = await getServerSession(authOptions);
    if (!session || session.user.role !== "club") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    await dbConnect();
    const { id } = await params;

    const user = await ClubUser.findOne({ _id: id, clubId: session.user.id });
    if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 });

    const tempPassword = generateTempPassword();
    user.temporaryPassword = await bcrypt.hash(tempPassword, 12);
    user.mustChangePassword = true;
    await user.save();

    const club = await Club.findById(session.user.id).select("name logoUrl language").lean();
    const baseUrl = process.env.NEXTAUTH_URL || "http://localhost:3000";

    await sendStaffResetPasswordEmail(user.email, {
      staffName: `${user.firstName} ${user.lastName}`,
      clubName: club?.name || "Club",
      temporaryPassword: tempPassword,
      loginUrl: baseUrl,
      logoUrl: club?.logoUrl || null,
      locale: user.language || club?.language || "en",
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Reset password error:", error);
    return NextResponse.json({ error: "Failed to reset password" }, { status: 500 });
  }
}
