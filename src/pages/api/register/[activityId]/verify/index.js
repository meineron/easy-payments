import { sendVerificationEmail } from "@/lib/email";
import { storeCode, generateCode } from "@/lib/verification-codes";
import { connectMain } from "@/lib/mongodb";
import { resolvePublicContext } from "@/lib/club-context";
import Club from "@/models/Club";

const SANDBOX_EMAILS = ["shlomi+1@easycoach.club"];

async function _POST(req, res) {
  try {
    const { activityId } = req.query;
    const { email, token } = req.body;
    if (!email) {
      return res.status(400).json({ error: "Email is required" });
    }

    const emailLower = email.trim().toLowerCase();

    const ctx = await resolvePublicContext("activity", activityId);
    if (!ctx) {
      return res.status(404).json({ error: "Activity not found" });
    }
    const { Order, Activity } = ctx.models;

    if (token && !SANDBOX_EMAILS.includes(emailLower)) {
      const order = await Order.findOne({ registrationToken: token, activityId });
      if (!order) {
        return res.status(404).json({ error: "Invalid registration link" });
      }
      const allowed = [
        (order.parent1Email || "").trim().toLowerCase(),
        (order.parent2Email || "").trim().toLowerCase(),
      ].filter(Boolean);
      if (!allowed.includes(emailLower)) {
        return res.status(403).json({ error: "This email is not associated with this registration. Please use a parent email on file." });
      }
    }

    const code = generateCode();
    storeCode(emailLower, code);

    const activity = await Activity.findById(activityId, "clubId").lean();
    await connectMain();
    const club = activity ? await Club.findById(activity.clubId, "language").lean() : null;
    const locale = club?.language || "en";

    await sendVerificationEmail(emailLower, code, locale);

    return res.status(200).json({ success: true });
  } catch (error) {
    console.error("Send OTP error:", error);
    return res.status(500).json({ error: "Failed to send code" });
  }
}
export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  return _POST(req, res);
}
