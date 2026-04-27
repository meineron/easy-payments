import { sendVerificationEmail } from "@/lib/email";
import { resolvePublicContext, dualUpsertById } from "@/lib/club-context";

const verificationCodes = new Map();

function generateCode() {
  return String(Math.floor(100000 + Math.random() * 900000));
}

async function _POST(req, res) {
  try {
    const { email, teamId } = req.body;

    if (!email || !teamId) {
      return res.status(400).json({ error: "Email and teamId are required" });
    }

    const ctx = await resolvePublicContext("team", teamId);
    if (!ctx) {
      return res.status(404).json({ error: "Team not found" });
    }
    const team = await ctx.models.Team.findById(teamId);
    if (!team) {
      return res.status(404).json({ error: "Team not found" });
    }

    const code = generateCode();
    const expiresAt = Date.now() + 10 * 60 * 1000;
    verificationCodes.set(email.toLowerCase().trim(), { code, expiresAt, teamId });

    await sendVerificationEmail(email, code);

    return res.status(200).json({ success: true });
  } catch (error) {
    console.error("Send verification code error:", error);
    return res.status(500).json({ error: "Failed to send verification code" });
  }
}

async function _PUT(req, res) {
  try {
    const { email, code, firstName, lastName, phone, phonePrefix, teamId, verifyOnly } = req.body;

    if (!email || !code || !teamId) {
      return res.status(200).json({ error: "Email, code, and teamId are required" }, { status: 400 });
    }

    if (!verifyOnly && (!firstName || !lastName || !phone)) {
      return res.status(400).json({ error: "All fields are required" });
    }

    const key = email.toLowerCase().trim();
    const stored = verificationCodes.get(key);

    if (!stored) {
      return res.status(400).json({ error: "No verification code found. Please request a new one." });
    }

    if (Date.now() > stored.expiresAt) {
      verificationCodes.delete(key);
      return res.status(400).json({ error: "Code expired. Please request a new one." });
    }

    if (stored.code !== code.trim()) {
      return res.status(400).json({ error: "Invalid code" });
    }

    verificationCodes.delete(key);

    const ctx = await resolvePublicContext("team", teamId);
    if (!ctx) {
      return res.status(404).json({ error: "Team not found" });
    }
    const team = await ctx.models.Team.findById(teamId);
    if (!team) {
      return res.status(404).json({ error: "Team not found" });
    }

    if (verifyOnly) {
      const parent = await ctx.models.Parent.findOneAndUpdate(
        { clubId: team.clubId, email: key },
        { $set: { emailVerified: true, emailVerifiedAt: new Date() } },
        { new: true }
      );
      if (parent) await dualUpsertById(ctx, "Parent", parent);
      return res.status(200).json({ success: true, parentId: parent?._id || null });
    }

    const parent = await ctx.models.Parent.findOneAndUpdate(
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
    await dualUpsertById(ctx, "Parent", parent);

    return res.status(200).json({ success: true, parentId: parent._id });
  } catch (error) {
    console.error("Verify code error:", error);
    return res.status(500).json({ error: "Failed to verify code" });
  }
}
export default async function handler(req, res) {
  if (req.method === "POST") {
    return _POST(req, res);
  } else if (req.method === "PUT") {
    return _PUT(req, res);
  } else {
    return res.status(405).json({ error: "Method not allowed" });
  }
}
