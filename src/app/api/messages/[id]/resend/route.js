import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import dbConnect from "@/lib/mongodb";
import Message from "@/models/Message";
import Club from "@/models/Club";
import { sendBulkEmail } from "@/lib/email";

export async function POST(request, { params }) {
  try {
    const session = await getServerSession(authOptions);
    if (!session || session.user.role !== "club") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    await dbConnect();

    const { id } = await params;
    const message = await Message.findById(id);
    if (!message) {
      return NextResponse.json({ error: "Message not found" }, { status: 404 });
    }
    if (String(message.clubId) !== session.user.id) {
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

    const club = await Club.findById(session.user.id, "name logoUrl smtpHost smtpPort smtpEmail smtpPassword").lean();
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
      await message.save();
      return NextResponse.json({ message: { _id: message._id, status: "sent" } });
    } catch (err) {
      console.error("Resend email error:", err);
      let errorReason = "unknown";
      if (err.code === "EAUTH") errorReason = "auth";
      else if (err.code === "ECONNREFUSED" || err.code === "ESOCKET") errorReason = "connection";
      message.status = "failed";
      await message.save();
      return NextResponse.json({ message: { _id: message._id, status: "failed", errorReason } });
    }
  } catch (error) {
    console.error("Resend message error:", error);
    return NextResponse.json({ error: "Failed to resend message" }, { status: 500 });
  }
}
