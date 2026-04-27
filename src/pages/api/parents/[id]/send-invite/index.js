import crypto from "crypto";
import { connectMain } from "@/lib/mongodb";
import { getClubContext, dualSave } from "@/lib/club-context";
import Club from "@/models/Club";
import { sendParentInvite } from "@/lib/email";

async function _POST(req, res) {
  try {
    const { ctx, error } = await getClubContext(req, res);
    if (error) return res.status(200).json(error.body, { status: error.status });
    const { Parent } = ctx.models;

    const { id } = req.query;
    const parent = await Parent.findOne({ _id: id, clubId: ctx.clubId });
    if (!parent) {
      return res.status(404).json({ error: "Parent not found" });
    }

    const token = crypto.randomUUID();
    parent.inviteToken = token;
    parent.invitedAt = new Date();
    await dualSave(ctx, parent);

    await connectMain();
    const club = await Club.findById(ctx.clubId, "name logoUrl language").lean();
    const baseUrl = process.env.NEXTAUTH_URL || "http://localhost:3000";
    const inviteUrl = `${baseUrl}/parent/login?invite=${token}`;

    await sendParentInvite(parent.email, {
      parentName: parent.firstName,
      clubName: club?.name || "Your Club",
      inviteUrl,
      logoUrl: club?.logoUrl || null,
      locale: club?.language || "en",
    });

    return res.status(200).json({ success: true, invitedAt: parent.invitedAt });
  } catch (error) {
    console.error("Send parent invite error:", error);
    return res.status(500).json({ error: "Failed to send invite" });
  }
}
export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  return _POST(req, res);
}
