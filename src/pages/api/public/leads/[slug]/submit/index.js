import { connectMain } from "@/lib/mongodb";
import { resolvePublicContext, dualCreate } from "@/lib/club-context";
import Club from "@/models/Club";
import ClubUser from "@/models/ClubUser";
import { writeLeadLog } from "@/lib/lead-logs";
import { sendBulkEmail } from "@/lib/email";
import { sendBulkSMS, toE164 } from "@/lib/sms";

function validateEmail(str) {
  return typeof str === "string" && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(str.trim());
}

function extractNameFromResponses(responses) {
  const first = responses.lead_firstName || responses.first_name || "";
  const last = responses.lead_lastName || responses.last_name || "";
  const combined = `${first} ${last}`.trim();
  if (combined) return combined;
  if (responses.name) return String(responses.name).trim();
  return "";
}

function extractPhone(responses) {
  const phone = responses.lead_phone || responses.phone || "";
  if (!phone || typeof phone !== "object") {
    return { phonePrefix: "", phone: typeof phone === "string" ? phone : "" };
  }
  return {
    phonePrefix: phone.prefix || phone.phonePrefix || "",
    phone: phone.number || phone.phone || "",
  };
}

function buildSubmissionSummaryHtml(lead, submission, submissionUrl) {
  const rows = [];
  for (const section of lead.formSections || []) {
    for (const field of section.fields || []) {
      if (field.type === "title_description") continue;
      const raw = submission.responses?.[field.key];
      if (raw === undefined || raw === null || raw === "") continue;
      let display = raw;
      if (typeof raw === "object") {
        if (raw.prefix !== undefined || raw.number !== undefined) {
          display = `${raw.prefix || ""} ${raw.number || ""}`.trim();
        } else {
          display = JSON.stringify(raw);
        }
      }
      if (Array.isArray(raw)) display = raw.join(", ");
      const label = (field.label || field.key).replace(/<[^>]*>/g, "");
      rows.push(`
        <tr>
          <td style="padding:6px 12px;border-bottom:1px solid #f3f4f6;color:#6b7280;font-size:12px;width:40%;">${label}</td>
          <td style="padding:6px 12px;border-bottom:1px solid #f3f4f6;color:#111827;font-size:13px;">${String(display).replace(/</g, "&lt;")}</td>
        </tr>`);
    }
  }
  return `
    <div>
      <h2 style="margin:0 0 12px 0;color:#111827;">New lead submission</h2>
      <p style="color:#6b7280;margin:0 0 16px 0;">You received a new submission on <strong>${lead.title}</strong>.</p>
      <table style="width:100%;border-collapse:collapse;border:1px solid #e5e7eb;border-radius:8px;overflow:hidden;">${rows.join("")}</table>
      ${submissionUrl ? `<p style="margin-top:16px;"><a href="${submissionUrl}" style="color:#2563eb;">View in dashboard</a></p>` : ""}
    </div>`;
}

async function _POST(req, res) {
  try {
    const { slug } = req.query;

    const ctx = await resolvePublicContext("leadSlug", slug);
    if (!ctx) {
      return res.status(404).json({ error: "Not found" });
    }
    const { Lead } = ctx.models;

    const lead = await Lead.findOne({ slug });
    if (!lead) {
      return res.status(404).json({ error: "Not found" });
    }
    if (lead.status !== "enabled") {
      return res.status(400).json({ error: "Lead is not accepting submissions" });
    }
    if (lead.expiresAt && new Date(lead.expiresAt) < new Date()) {
      return res.status(400).json({ error: "Lead has expired" });
    }

    const body = req.body;
    const responses = body.responses || {};

    const missing = [];
    for (const section of lead.formSections || []) {
      for (const field of section.fields || []) {
        if (field.hidden || field.type === "title_description") continue;
        if (!field.required && !field.isMust) continue;
        const val = responses[field.key];
        let isEmpty = false;
        if (val === undefined || val === null || val === "") isEmpty = true;
        else if (Array.isArray(val) && val.length === 0) isEmpty = true;
        else if (typeof val === "object" && !Array.isArray(val)) {
          const keys = Object.keys(val);
          if (keys.length === 0) isEmpty = true;
          else if (field.type === "phone") {
            const num = val.number || val.phone || "";
            if (!num || !String(num).trim()) isEmpty = true;
          }
        }
        if (isEmpty) {
          missing.push({ key: field.key, label: field.label || field.key });
        }
      }
    }
    if (missing.length > 0) {
      return res.status(200).json({ error: "Missing required fields", missing }, { status: 400 });
    }

    const emailValue = String(responses.lead_email || "").trim();
    if (!validateEmail(emailValue)) {
      return res.status(400).json({ error: "Valid email is required" });
    }

    const phoneExtracted = extractPhone(responses);
    if (!phoneExtracted.phone || !String(phoneExtracted.phone).replace(/\D/g, "")) {
      return res.status(400).json({ error: "Valid phone is required" });
    }

    const submission = await dualCreate(ctx, "LeadSubmission", {
      leadId: lead._id,
      clubId: lead.clubId,
      name: extractNameFromResponses(responses),
      email: emailValue.toLowerCase(),
      phonePrefix: phoneExtracted.phonePrefix || "",
      phone: String(phoneExtracted.phone).replace(/\D/g, ""),
      responses,
    });

    await writeLeadLog({
      leadId: lead._id,
      submissionId: submission._id,
      clubId: lead.clubId,
      type: "submission_received",
      authorType: "system",
      authorName: submission.name || submission.email,
      content: `New submission from ${submission.name || submission.email}`,
      context: {
        email: submission.email,
        phone: submission.phone,
        phonePrefix: submission.phonePrefix,
        name: submission.name,
      },
      ctx,
    });

    if (Array.isArray(lead.notifyStaffIds) && lead.notifyStaffIds.length > 0) {
      try {
        await connectMain();
        const staff = await ClubUser.find({
          _id: { $in: lead.notifyStaffIds },
          clubId: lead.clubId,
          status: { $in: ["invited", "active"] },
        }).select("firstName lastName email phonePrefix phone").lean();

        const club = await Club.findById(lead.clubId)
          .select("name logoUrl smtpHost smtpPort smtpEmail smtpPassword").lean();

        const baseUrl = process.env.NEXTAUTH_URL || "";
        const submissionUrl = baseUrl ? `${baseUrl}/dashboard/leads/${lead._id}` : "";
        const html = buildSubmissionSummaryHtml(lead, submission, submissionUrl);
        const subject = `New lead: ${lead.title} — ${submission.name || submission.email}`;

        const notifiedEmails = [];
        const notifiedPhones = [];

        if (lead.notifyChannels?.email !== false) {
          const emails = staff.map((s) => s.email).filter(Boolean);
          if (emails.length > 0) {
            try {
              await sendBulkEmail({ club, subject, bodyHtml: html, bccList: emails, logoUrl: club?.logoUrl });
              notifiedEmails.push(...emails);
            } catch (err) {
              console.error("Staff notify email error:", err);
            }
          }
        }

        if (lead.notifyChannels?.sms === true) {
          const phones = staff
            .map((s) => toE164(s.phonePrefix, s.phone))
            .filter(Boolean);
          if (phones.length > 0) {
            try {
              const text = `New lead on ${lead.title}: ${submission.name || submission.email}`;
              await sendBulkSMS({ phoneNumbers: phones, message: text });
              notifiedPhones.push(...phones);
            } catch (err) {
              console.error("Staff notify SMS error:", err);
            }
          }
        }

        if (notifiedEmails.length > 0 || notifiedPhones.length > 0) {
          await writeLeadLog({
            leadId: lead._id,
            submissionId: submission._id,
            clubId: lead.clubId,
            type: "staff_notified",
            authorType: "system",
            authorName: "System",
            content: `Notified ${notifiedEmails.length} staff by email, ${notifiedPhones.length} by SMS`,
            context: {
              emailCount: notifiedEmails.length,
              smsCount: notifiedPhones.length,
              staffIds: staff.map((s) => String(s._id)),
            },
            ctx,
          });
        }
      } catch (err) {
        console.error("Staff notification error:", err);
      }
    }

    return res.status(200).json({ success: true, submissionId: submission._id }, { status: 201 });
  } catch (error) {
    console.error("Submit lead error:", error);
    return res.status(500).json({ error: "Failed to submit" });
  }
}
export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  return _POST(req, res);
}
