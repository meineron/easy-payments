import { NextResponse } from "next/server";
import { verifyCode } from "@/lib/verification-codes";

export async function POST(request) {
  try {
    const { email, code } = await request.json();
    if (!email || !code) {
      return NextResponse.json({ error: "Email and code are required" }, { status: 400 });
    }

    const result = verifyCode(email.trim().toLowerCase(), code);
    if (!result.valid) {
      return NextResponse.json({ error: result.error }, { status: 400 });
    }

    return NextResponse.json({ success: true, verified: true });
  } catch (error) {
    console.error("Verify code error:", error);
    return NextResponse.json({ error: "Failed to verify code" }, { status: 500 });
  }
}
