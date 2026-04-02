import { NextResponse } from "next/server";
import { sendVerificationEmail } from "@/lib/email";
import dbConnect from "@/lib/mongodb";
import Team from "@/models/Team";
import Parent from "@/models/Parent";

const verificationCodes = new Map();

function generateCode() {
  return String(Math.floor(100000 + Math.random() * 900000));
}

export async function POST(request) {
  try {
    const { email, teamId } = await request.json();

    if (!email || !teamId) {
      return NextResponse.json({ error: "Email and teamId are required" }, { status: 400 });
    }

    await dbConnect();
    const team = await Team.findById(teamId);
    if (!team) {
      return NextResponse.json({ error: "Team not found" }, { status: 404 });
    }

    const code = generateCode();
    const expiresAt = Date.now() + 10 * 60 * 1000;
    verificationCodes.set(email.toLowerCase().trim(), { code, expiresAt, teamId });

    await sendVerificationEmail(email, code);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Send verification code error:", error);
    return NextResponse.json({ error: "Failed to send verification code" }, { status: 500 });
  }
}

export async function PUT(request) {
  try {
    const { email, code, firstName, lastName, phone, phonePrefix, teamId, verifyOnly } = await request.json();

    if (!email || !code || !teamId) {
      return NextResponse.json({ error: "Email, code, and teamId are required" }, { status: 400 });
    }

    if (!verifyOnly && (!firstName || !lastName || !phone)) {
      return NextResponse.json({ error: "All fields are required" }, { status: 400 });
    }

    const key = email.toLowerCase().trim();
    const stored = verificationCodes.get(key);

    if (!stored) {
      return NextResponse.json({ error: "No verification code found. Please request a new one." }, { status: 400 });
    }

    if (Date.now() > stored.expiresAt) {
      verificationCodes.delete(key);
      return NextResponse.json({ error: "Code expired. Please request a new one." }, { status: 400 });
    }

    if (stored.code !== code.trim()) {
      return NextResponse.json({ error: "Invalid code" }, { status: 400 });
    }

    verificationCodes.delete(key);

    await dbConnect();
    const team = await Team.findById(teamId);
    if (!team) {
      return NextResponse.json({ error: "Team not found" }, { status: 404 });
    }

    if (verifyOnly) {
      const parent = await Parent.findOneAndUpdate(
        { clubId: team.clubId, email: key },
        { $set: { emailVerified: true, emailVerifiedAt: new Date() } },
        { new: true }
      );
      return NextResponse.json({ success: true, parentId: parent?._id || null });
    }

    const parent = await Parent.findOneAndUpdate(
      { clubId: team.clubId, email: key },
      {
        $set: {
          firstName: firstName.trim(),
          lastName: lastName.trim(),
          phone: phone.trim(),
          phonePrefix: (phonePrefix || "+1").trim(),
          emailVerified: true,
          emailVerifiedAt: new Date(),
        },
        $setOnInsert: {
          clubId: team.clubId,
          email: key,
          players: [],
        },
      },
      { upsert: true, new: true }
    );

    return NextResponse.json({ success: true, parentId: parent._id });
  } catch (error) {
    console.error("Verify code error:", error);
    return NextResponse.json({ error: "Failed to verify code" }, { status: 500 });
  }
}
