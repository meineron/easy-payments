import { connectMain } from "@/lib/mongodb";
import { getClubContext, dualCreate } from "@/lib/club-context";
import Club from "@/models/Club";
import { sendBulkEmail } from "@/lib/email";
import { sendBulkSMS, toE164 } from "@/lib/sms";

async function _GET(req, res) {
  try {
    const { ctx, error } = await getClubContext(req, res);
    if (error) return res.status(200).json(error.body, { status: error.status });
    const { Message } = ctx.models;

    const { searchParams } = new URL(request.url);
    const page = Math.max(1, parseInt(searchParams.get("page") || "1", 10));
    const limit = Math.min(50, Math.max(1, parseInt(searchParams.get("limit") || "20", 10)));
    const skip = (page - 1) * limit;

    const filter = { clubId: ctx.clubId };

    const [messages, total] = await Promise.all([
      Message.find(filter, "subject recipientCount sentAt status fromEmail channel bodyText")
        .sort({ sentAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      Message.countDocuments(filter),
    ]);

    return res.status(200).json({ messages, total, page, pages: Math.ceil(total / limit) });
  } catch (error) {
    console.error("List messages error:", error);
    return res.status(500).json({ error: "Failed to load messages" });
  }
}

async function resolvePhoneNumbers(ctx, recipients) {
  const phones = [];
  const { Parent, Player } = ctx.models;

  for (const r of recipients) {
    if (r.phonePrefix && r.phone) {
      const e164 = toE164(r.phonePrefix, r.phone);
      if (e164) phones.push(e164);
      continue;
    }
    if (r.phone) {
      const e164 = toE164("", r.phone);
      if (e164) { phones.push(e164); continue; }
    }
  }

  const unresolvedParentIds = recipients.filter((r) => r.type === "parent" && !r.phone).map((r) => r.id);
  const unresolvedPlayerIds = recipients.filter((r) => r.type === "player" && !r.phone).map((r) => r.id);

  if (unresolvedParentIds.length > 0) {
    const parents = await Parent.find({ _id: { $in: unresolvedParentIds }, clubId: ctx.clubId }, "phonePrefix phone").lean();
    for (const p of parents) {
      const e164 = toE164(p.phonePrefix, p.phone);
      if (e164) phones.push(e164);
    }
  }
  if (unresolvedPlayerIds.length > 0) {
    const players = await Player.find({ _id: { $in: unresolvedPlayerIds }, clubId: ctx.clubId }, "parents").lean();
    const allParentIds = players.flatMap((p) => p.parents || []);
    if (allParentIds.length > 0) {
      const parents = await Parent.find({ _id: { $in: allParentIds }, clubId: ctx.clubId }, "phonePrefix phone").lean();
      for (const p of parents) {
        const e164 = toE164(p.phonePrefix, p.phone);
        if (e164) phones.push(e164);
      }
    }
  }

  return [...new Set(phones)];
}

async function _POST(req, res) {
  try {
    const { ctx, error } = await getClubContext(req, res);
    if (error) return res.status(200).json(error.body, { status: error.status });

    const body = req.body;
    const { channel = "email", subject, bodyHtml, bodyText, recipients, smsNotification, smsText } = body;

    if (!recipients?.length) {
      return res.status(400).json({ error: "At least one recipient is required" });
    }

    await connectMain();
    const club = await Club.findById(ctx.clubId, "name logoUrl smtpHost smtpPort smtpEmail smtpPassword").lean();
    if (!club) {
      return res.status(404).json({ error: "Club not found" });
    }

    let fromEmail = "";
    let status = "sent";
    let errorReason = "";

    if (channel === "email") {
      if (!subject?.trim()) {
        return res.status(400).json({ error: "Subject is required" });
      }
      if (!bodyHtml?.trim()) {
        return res.status(400).json({ error: "Message body is required" });
      }

      const bccList = [...new Set(recipients.map((r) => r.email).filter(Boolean))];

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
        if (err.code === "EAUTH") errorReason = "auth";
        else if (err.code === "ECONNREFUSED" || err.code === "ESOCKET") errorReason = "connection";
        else errorReason = "unknown";
      }

      if (smsNotification && status === "sent") {
        try {
          const phoneNumbers = await resolvePhoneNumbers(ctx, recipients);
          if (phoneNumbers.length > 0) {
            const text = (smsText || `You have received an email from us. Subject: ${subject.trim()}`).replace(/\{email_subject\}/g, subject.trim());
            await sendBulkSMS({ phoneNumbers, message: text });
          }
        } catch (err) {
          console.error("SMS notification error:", err);
        }
      }

      const message = await dualCreate(ctx, "Message", {
        clubId: ctx.clubId,
        channel: "email",
        subject: subject.trim(),
        bodyHtml,
        recipients,
        recipientCount: [...new Set(recipients.map((r) => r.email).filter(Boolean))].length,
        fromEmail,
        status,
        smsNotification: !!smsNotification,
        smsNotificationText: smsText || "",
      });

      return res.status(200).json({
        message: { _id: message._id, status: message.status, errorReason },
      }, { status: 201 });
    } else {
      if (!bodyText?.trim()) {
        return res.status(400).json({ error: "SMS message is required" });
      }

      const phoneNumbers = await resolvePhoneNumbers(ctx, recipients);
      console.log("SMS resolved phone numbers:", phoneNumbers);

      if (phoneNumbers.length === 0) {
        status = "failed";
        errorReason = "no_phones";
        console.error("SMS send: no phone numbers resolved from recipients");
      } else {
        try {
          const smsResult = await sendBulkSMS({ phoneNumbers, message: bodyText.trim() });
          console.log("SMS send result:", smsResult);
          if (smsResult.sent === 0 && smsResult.failed > 0) {
            status = "failed";
            errorReason = "sms";
            console.error("SMS send: all messages failed:", smsResult.errors);
          }
        } catch (err) {
          console.error("Send bulk SMS error:", err);
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
        recipientCount: phoneNumbers.length,
        status,
      });

      return res.status(200).json({
        message: { _id: message._id, status: message.status, errorReason },
      }, { status: 201 });
    }
  } catch (error) {
    console.error("Send message error:", error);
    return res.status(500).json({ error: "Failed to send message" });
  }
}
export default async function handler(req, res) {
  if (req.method === "GET") {
    return _GET(req, res);
  } else if (req.method === "POST") {
    return _POST(req, res);
  } else {
    return res.status(405).json({ error: "Method not allowed" });
  }
}
