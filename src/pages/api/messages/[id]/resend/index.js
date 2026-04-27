import { connectMain } from "@/lib/mongodb";
import { getClubContext, dualSave } from "@/lib/club-context";
import Club from "@/models/Club";
import { sendBulkEmail } from "@/lib/email";

async function _POST(req, res) {
  try {
    const { ctx, error } = await getClubContext(req, res);
    if (error) return res.status(200).json(error.body, { status: error.status });
    const { Message } = ctx.models;

    const { id } = req.query;
    const message = await Message.findById(id);
    if (!message) {
      return res.status(404).json({ error: "Message not found" });
    }
    if (String(message.clubId) !== String(ctx.clubId)) {
      return res.status(403).json({ error: "Unauthorized" });
    }

    const body = req.body;
    const { subject, bodyHtml, recipients } = body;

    if (subject?.trim()) message.subject = subject.trim();
    if (bodyHtml?.trim()) message.bodyHtml = bodyHtml;
    if (recipients?.length) {
      message.recipients = recipients;
      message.recipientCount = [...new Set(recipients.map((r) => r.email).filter(Boolean))].length;
    }

    await connectMain();
    const club = await Club.findById(ctx.clubId, "name logoUrl smtpHost smtpPort smtpEmail smtpPassword").lean();
    if (!club) {
      return res.status(404).json({ error: "Club not found" });
    }

    const bccList = [...new Set(message.recipients.map((r) => r.email).filter(Boolean))];

    try {
      const fromEmail = await sendBulkEmail({
        club,
        subject: message.subject,
        bodyHtml: message.bodyHtml,
        bccList,
        logoUrl: club.logoUrl,
      });
      message.fromEmail = fromEmail;
      message.status = "sent";
      message.sentAt = new Date();
      await dualSave(ctx, message);
      return res.status(200).json({ message: { _id: message._id, status: "sent" } });
    } catch (err) {
      console.error("Resend email error:", err);
      let errorReason = "unknown";
      if (err.code === "EAUTH") errorReason = "auth";
      else if (err.code === "ECONNREFUSED" || err.code === "ESOCKET") errorReason = "connection";
      message.status = "failed";
      await dualSave(ctx, message);
      return res.status(200).json({ message: { _id: message._id, status: "failed", errorReason } });
    }
  } catch (error) {
    console.error("Resend message error:", error);
    return res.status(500).json({ error: "Failed to resend message" });
  }
}
export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  return _POST(req, res);
}
