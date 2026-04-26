import { NextResponse } from "next/server";
import { connectMain } from "@/lib/mongodb";
import { getClubContext, dualCreate } from "@/lib/club-context";
import Club from "@/models/Club";
import { sendBulkEmail } from "@/lib/email";
import { sendBulkSMS, toE164 } from "@/lib/sms";
import { writeLeadLog, getSessionAuthor } from "@/lib/lead-logs";

export async function POST(request, { params }) {
  try {
    const { session, ctx, error } = await getClubContext();
    if (error) return NextResponse.json(error.body, { status: error.status });
    const { Lead, LeadSubmission } = ctx.models;

    const { id } = await params;
    const body = await request.json();
    const {
      channel = "email",
      subject,
      bodyHtml,
      bodyText,
      submissionIds,
      smsNotification,
      smsText,
    } = body;

    if (!Array.isArray(submissionIds) || submissionIds.length === 0) {
      return NextResponse.json({ error: "At least one recipient is required" }, { status: 400 });
    }

    const lead = await Lead.findOne({ _id: id, clubId: ctx.clubId }).select("_id title").lean();
    if (!lead) {
      return NextResponse.json({ error: "Lead not found" }, { status: 404 });
    }

    const submissions = await LeadSubmission.find({
      _id: { $in: submissionIds },
      leadId: id,
      clubId: ctx.clubId,
    }).lean();

    if (submissions.length === 0) {
      return NextResponse.json({ error: "No valid submissions" }, { status: 400 });
    }

    const recipients = submissions.map((s) => ({
      type: "lead",
      id: String(s._id),
      name: s.name || s.email || "Lead",
      email: s.email || "",
      phonePrefix: s.phonePrefix || "",
      phone: s.phone || "",
    }));

    await connectMain();
    const club = await Club.findById(ctx.clubId, "name logoUrl smtpHost smtpPort smtpEmail smtpPassword").lean();
    if (!club) {
      return NextResponse.json({ error: "Club not found" }, { status: 404 });
    }

    let fromEmail = "";
    let status = "sent";
    let errorReason = "";

    if (channel === "email") {
      if (!subject?.trim()) {
        return NextResponse.json({ error: "Subject is required" }, { status: 400 });
      }
      if (!bodyHtml?.trim()) {
        return NextResponse.json({ error: "Message body is required" }, { status: 400 });
      }

      const bccList = [...new Set(recipients.map((r) => r.email).filter(Boolean))];
      if (bccList.length === 0) {
        return NextResponse.json({ error: "Recipients have no email addresses" }, { status: 400 });
      }

      try {
        fromEmail = await sendBulkEmail({
          club,
          subject: subject.trim(),
          bodyHtml,
          bccList,
          logoUrl: club.logoUrl,
        });
      } catch (err) {
        console.error("Send lead email error:", err);
        status = "failed";
        fromEmail = club.smtpEmail || process.env.EASYCOACH_EMAIL || "";
        if (err.code === "EAUTH") errorReason = "auth";
        else if (err.code === "ECONNREFUSED" || err.code === "ESOCKET") errorReason = "connection";
        else errorReason = "unknown";
      }

      if (smsNotification && status === "sent") {
        try {
          const phones = recipients
            .map((r) => toE164(r.phonePrefix, r.phone))
            .filter(Boolean);
          if (phones.length > 0) {
            const text = (smsText || `You have received an email. Subject: ${subject.trim()}`)
              .replace(/\{email_subject\}/g, subject.trim());
            await sendBulkSMS({ phoneNumbers: [...new Set(phones)], message: text });
          }
        } catch (err) {
          console.error("Lead SMS notification error:", err);
        }
      }

      const message = await dualCreate(ctx, "Message", {
        clubId: ctx.clubId,
        channel: "email",
        subject: subject.trim(),
        bodyHtml,
        recipients,
        recipientCount: bccList.length,
        fromEmail,
        status,
        smsNotification: !!smsNotification,
        smsNotificationText: smsText || "",
      });

      if (status === "sent") {
        const author = getSessionAuthor(session);
        await Promise.all(submissions.map((s) => writeLeadLog({
          leadId: id,
          submissionId: s._id,
          clubId: ctx.clubId,
          type: "message_sent",
          ...author,
          content: `Email sent: ${subject.trim()}`,
          context: {
            messageId: String(message._id),
            channel: "email",
            subject: subject.trim(),
            smsNotification: !!smsNotification,
          },
          ctx,
        })));
      }

      return NextResponse.json({
        message: { _id: message._id, status: message.status, errorReason },
      }, { status: 201 });
    } else {
      if (!bodyText?.trim()) {
        return NextResponse.json({ error: "SMS message is required" }, { status: 400 });
      }

      const phones = [...new Set(
        recipients.map((r) => toE164(r.phonePrefix, r.phone)).filter(Boolean),
      )];

      if (phones.length === 0) {
        status = "failed";
        errorReason = "no_phones";
      } else {
        try {
          const result = await sendBulkSMS({ phoneNumbers: phones, message: bodyText.trim() });
          if (result.sent === 0 && result.failed > 0) {
            status = "failed";
            errorReason = "sms";
          }
        } catch (err) {
          console.error("Send lead SMS error:", err);
          status = "failed";
          errorReason = "sms";
        }
      }

      const message = await dualCreate(ctx, "Message", {
        clubId: ctx.clubId,
        channel: "sms",
        subject: subject?.trim() || "SMS",
        bodyText: bodyText.trim(),
        recipients,
        recipientCount: phones.length,
        status,
      });

      if (status === "sent") {
        const author = getSessionAuthor(session);
        await Promise.all(submissions.map((s) => writeLeadLog({
          leadId: id,
          submissionId: s._id,
          clubId: ctx.clubId,
          type: "message_sent",
          ...author,
          content: `SMS sent`,
          context: {
            messageId: String(message._id),
            channel: "sms",
          },
          ctx,
        })));
      }

      return NextResponse.json({
        message: { _id: message._id, status: message.status, errorReason },
      }, { status: 201 });
    }
  } catch (error) {
    console.error("Lead send-message error:", error);
    return NextResponse.json({ error: "Failed to send message" }, { status: 500 });
  }
}
