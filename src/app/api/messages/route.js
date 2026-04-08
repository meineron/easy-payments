import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import dbConnect from "@/lib/mongodb";
import Message from "@/models/Message";
import Club from "@/models/Club";
import { sendBulkEmail } from "@/lib/email";

export async function GET(request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session || session.user.role !== "club") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    await dbConnect();

    const { searchParams } = new URL(request.url);
    const page = Math.max(1, parseInt(searchParams.get("page") || "1", 10));
    const limit = Math.min(50, Math.max(1, parseInt(searchParams.get("limit") || "20", 10)));
    const skip = (page - 1) * limit;

    const filter = { clubId: session.user.id };

    const [messages, total] = await Promise.all([
      Message.find(filter, "subject recipientCount sentAt status fromEmail")
        .sort({ sentAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      Message.countDocuments(filter),
    ]);

    return NextResponse.json({ messages, total, page, pages: Math.ceil(total / limit) });
  } catch (error) {
    console.error("List messages error:", error);
    return NextResponse.json({ error: "Failed to load messages" }, { status: 500 });
  }
}

export async function POST(request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session || session.user.role !== "club") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    await dbConnect();

    const body = await request.json();
    const { subject, bodyHtml, recipients } = body;

    if (!subject?.trim()) {
      return NextResponse.json({ error: "Subject is required" }, { status: 400 });
    }
    if (!bodyHtml?.trim()) {
      return NextResponse.json({ error: "Message body is required" }, { status: 400 });
    }
    if (!recipients?.length) {
      return NextResponse.json({ error: "At least one recipient is required" }, { status: 400 });
    }

    const club = await Club.findById(session.user.id, "name logoUrl smtpHost smtpPort smtpEmail smtpPassword").lean();
    if (!club) {
      return NextResponse.json({ error: "Club not found" }, { status: 404 });
    }

    const bccList = [...new Set(recipients.map((r) => r.email).filter(Boolean))];

    let fromEmail = "";
    let status = "sent";
    let errorReason = "";

    try {
      fromEmail = await sendBulkEmail({
        club,
        subject: subject.trim(),
        bodyHtml,
        bccList,
        logoUrl: club.logoUrl,
      });
    } catch (err) {
      console.error("Send bulk email error:", err);
      status = "failed";
      fromEmail = club.smtpEmail || process.env.EASYCOACH_EMAIL || "";

      if (err.code === "EAUTH") {
        errorReason = "auth";
      } else if (err.code === "ECONNREFUSED" || err.code === "ESOCKET") {
        errorReason = "connection";
      } else {
        errorReason = "unknown";
      }
    }

    const message = await Message.create({
      clubId: session.user.id,
      subject: subject.trim(),
      bodyHtml,
      recipients,
      recipientCount: bccList.length,
      fromEmail,
      status,
    });

    return NextResponse.json({
      message: { _id: message._id, status: message.status, errorReason },
    }, { status: 201 });
  } catch (error) {
    console.error("Send message error:", error);
    return NextResponse.json({ error: "Failed to send message" }, { status: 500 });
  }
}
