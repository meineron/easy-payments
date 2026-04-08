import { NextResponse } from "next/server";
import { sendVerificationEmail } from "@/lib/email";
import { storeCode, generateCode } from "@/lib/verification-codes";
import dbConnect from "@/lib/mongodb";
import Order from "@/models/Order";
import Activity from "@/models/Activity";
import Club from "@/models/Club";

const SANDBOX_EMAILS = ["shlomi+1@easycoach.club"];

export async function POST(request, { params }) {
  try {
    const { activityId } = await params;
    const { email, token } = await request.json();
    if (!email) {
      return NextResponse.json({ error: "Email is required" }, { status: 400 });
    }

    const emailLower = email.trim().toLowerCase();

    if (token && !SANDBOX_EMAILS.includes(emailLower)) {
      await dbConnect();
      const order = await Order.findOne({ registrationToken: token, activityId });
      if (!order) {
        return NextResponse.json({ error: "Invalid registration link" }, { status: 404 });
      }
      const allowed = [
        (order.parent1Email || "").trim().toLowerCase(),
        (order.parent2Email || "").trim().toLowerCase(),
      ].filter(Boolean);
      if (!allowed.includes(emailLower)) {
        return NextResponse.json({ error: "This email is not associated with this registration. Please use a parent email on file." }, { status: 403 });
      }
    }

    const code = generateCode();
    storeCode(emailLower, code);

    await dbConnect();
    const activity = await Activity.findById(activityId, "clubId").lean();
    const club = activity ? await Club.findById(activity.clubId, "language").lean() : null;
    const locale = club?.language || "en";

    await sendVerificationEmail(emailLower, code, locale);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Send OTP error:", error);
    return NextResponse.json({ error: "Failed to send code" }, { status: 500 });
  }
}
