import { NextResponse } from "next/server";
import { connectMain } from "@/lib/mongodb";
import { getClubContext, dualSave } from "@/lib/club-context";
import Club from "@/models/Club";
import { sendBulkEmail } from "@/lib/email";

export async function POST(request, { params }) {
  try {
    const { ctx, error } = await getClubContext();
    if (error) return NextResponse.json(error.body, { status: error.status });
    const { Message } = ctx.models;

    const { id } = await params;
    const message = await Message.findById(id);
    if (!message) {
      return NextResponse.json({ error: "Message not found" }, { status: 404 });
    }
    if (String(message.clubId) !== String(ctx.clubId)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    }

    const body = await request.json();
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
      return NextResponse.json({ error: "Club not found" }, { status: 404 });
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
      return NextResponse.json({ message: { _id: message._id, status: "sent" } });
    } catch (err) {
      console.error("Resend email error:", err);
      let errorReason = "unknown";
      if (err.code === "EAUTH") errorReason = "auth";
      else if (err.code === "ECONNREFUSED" || err.code === "ESOCKET") errorReason = "connection";
      message.status = "failed";
      await dualSave(ctx, message);
      return NextResponse.json({ message: { _id: message._id, status: "failed", errorReason } });
    }
  } catch (error) {
    console.error("Resend message error:", error);
    return NextResponse.json({ error: "Failed to resend message" }, { status: 500 });
  }
}
