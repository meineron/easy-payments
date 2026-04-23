import dbConnect from "@/lib/mongodb";
import Activity from "@/models/Activity";
import Club from "@/models/Club";
import Order from "@/models/Order";
import { getClubTransporter } from "@/lib/email";
import en from "@/messages/en.json";
import he from "@/messages/he.json";

const msgs = { en, he };
function t(locale, ns, key, reps = {}) {
  const msg = msgs[locale]?.[ns]?.[key] || msgs.en[ns]?.[key] || key;
  return Object.entries(reps).reduce(
    (s, [k, v]) => s.replace(new RegExp(`\\{${k}\\}`, "g"), v),
    msg,
  );
}

// Default player-detail form-field keys already rendered explicitly — skip
// them when listing dynamic form answers so we don't double-print.
const BUILTIN_PLAYER_KEYS = new Set([
  "firstName", "lastName", "dob", "dateOfBirth", "gender",
  "phone", "phoneNumber", "phonePrefix", "email",
]);

function esc(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function fmtDob(s) {
  if (!s) return "";
  if (typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s)) {
    const [y, m, d] = s.split("-").map(Number);
    return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("en-US", {
      year: "numeric", month: "2-digit", day: "2-digit", timeZone: "UTC",
    });
  }
  const dt = new Date(s);
  if (Number.isNaN(dt.getTime())) return "";
  return dt.toLocaleDateString("en-US", { year: "numeric", month: "2-digit", day: "2-digit" });
}

function fmtDateTimeLong(d) {
  if (!d) return "";
  const dt = new Date(d);
  if (Number.isNaN(dt.getTime())) return "";
  return dt.toLocaleString("en-US", {
    year: "numeric", month: "long", day: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
}

function detailRow(label, value) {
  if (value === null || value === undefined || value === "") return "";
  return `<tr>
    <td style="padding:6px 0;color:#6b7280;font-size:13px;width:40%;vertical-align:top;">${esc(label)}</td>
    <td style="padding:6px 0;color:#111827;font-size:13px;font-weight:500;">${esc(value)}</td>
  </tr>`;
}

function detailTable(title, rows) {
  const filtered = rows.filter(Boolean).join("");
  if (!filtered) return "";
  return `
    <div style="margin-bottom:18px;">
      <h3 style="margin:0 0 8px;font-size:12px;font-weight:700;color:#1e40af;text-transform:uppercase;letter-spacing:0.05em;">${esc(title)}</h3>
      <div style="border:1px solid #e5e7eb;border-radius:8px;padding:12px 16px;background:#ffffff;">
        <table style="width:100%;border-collapse:collapse;">${filtered}</table>
      </div>
    </div>
  `;
}

function buildDynamicAnswers(order, formSections) {
  const formData = order.formData || {};
  const rows = [];
  for (const section of (formSections || [])) {
    for (const field of (section.fields || [])) {
      if (field.hidden) continue;
      if (field.type === "title_description") continue;
      if (field.isDefault && BUILTIN_PLAYER_KEYS.has(field.key)) continue;
      const raw = formData[field.key];
      if (raw === undefined || raw === null || raw === "") continue;
      const value = Array.isArray(raw) ? raw.join(", ") : String(raw);
      if (!value) continue;
      rows.push(detailRow(field.label || field.key, value));
    }
  }
  return rows;
}

function waiverBlock(consent, waiverDoc, locale, fallbackParentName) {
  const title = esc(consent.title || waiverDoc?.title || "Waiver");
  const body = waiverDoc?.contentHtml || "";
  const signedBy = consent.agreedByName || fallbackParentName || "";
  const signedEmail = consent.agreedByEmail ? ` (${esc(consent.agreedByEmail)})` : "";
  const signedAt = fmtDateTimeLong(consent.agreedAt);
  const signedLine = t(locale, "email", "waiverSignedBy", { name: esc(signedBy) });

  return `
    <div style="border:1px solid #e5e7eb;border-radius:10px;padding:18px 20px;margin-bottom:16px;background:#ffffff;">
      <h3 style="margin:0 0 10px;font-size:15px;font-weight:700;color:#111827;">${title}</h3>
      <div style="font-size:13px;line-height:1.55;color:#374151;">
        ${body || `<p style="margin:0;color:#9ca3af;font-style:italic;">(No content)</p>`}
      </div>
      <div style="margin-top:14px;padding-top:12px;border-top:1px dashed #e5e7eb;font-size:12px;color:#4b5563;">
        <div><strong style="color:#111827;">${signedLine}</strong>${signedEmail}</div>
        ${signedAt ? `<div style="margin-top:2px;color:#6b7280;">${esc(signedAt)}</div>` : ""}
      </div>
    </div>
  `;
}

function buildWaiverConfirmationHtml({
  order,
  activity,
  club,
  signedConsents,
  locale,
  playerName,
  parentName,
}) {
  const playerRows = [
    detailRow("Name", `${order.playerFirstName || ""} ${order.playerLastName || ""}`.trim()),
    detailRow("Date of Birth", fmtDob(order.playerDob)),
    detailRow("Gender", order.playerGender),
    detailRow("Phone", order.playerPhone ? `${order.playerPhonePrefix || ""} ${order.playerPhone}`.trim() : ""),
    detailRow("Email", order.playerEmail),
  ];

  const parent1Rows = [
    detailRow("Name", `${order.parent1FirstName || ""} ${order.parent1LastName || ""}`.trim()),
    detailRow("Phone", order.parent1Phone ? `${order.parent1PhonePrefix || ""} ${order.parent1Phone}`.trim() : ""),
    detailRow("Email", order.parent1Email),
  ];

  const parent2Rows = (order.parent2FirstName || order.parent2Email) ? [
    detailRow("Name", `${order.parent2FirstName || ""} ${order.parent2LastName || ""}`.trim()),
    detailRow("Phone", order.parent2Phone ? `${order.parent2PhonePrefix || ""} ${order.parent2Phone}`.trim() : ""),
    detailRow("Email", order.parent2Email),
  ] : [];

  const dynamicRows = buildDynamicAnswers(order, activity.formSections);

  const waiverMap = {};
  (activity.waivers || []).forEach((w) => { waiverMap[String(w._id)] = w; });
  const waiversHtml = signedConsents
    .map((c) => waiverBlock(c, waiverMap[c.waiverId], locale, parentName))
    .join("");

  const dir = locale === "he" ? "rtl" : "ltr";

  const logoBlock = club.logoUrl && /^https?:\/\//.test(club.logoUrl)
    ? `<div style="text-align:center;margin-bottom:18px;"><img src="${esc(club.logoUrl)}" alt="${esc(club.name || "")}" style="max-height:60px;max-width:200px;object-fit:contain;" /></div>`
    : "";

  return `
    <div dir="${dir}" style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;background:#f9fafb;padding:32px 16px;">
      <div style="max-width:620px;margin:0 auto;background:#ffffff;border-radius:14px;padding:32px;box-shadow:0 1px 3px rgba(0,0,0,0.04);">
        ${logoBlock}
        <h1 style="margin:0 0 4px;font-size:22px;font-weight:700;color:#111827;text-align:center;">
          ${esc(t(locale, "email", "waiverConfirmTitle"))}
        </h1>
        <p style="margin:0 0 24px;text-align:center;font-size:14px;color:#6b7280;">
          ${t(locale, "email", "waiverConfirmDesc", {
            player: `<strong style="color:#111827;">${esc(playerName)}</strong>`,
            activity: `<strong style="color:#111827;">${esc(activity.title || "")}</strong>`,
          })}
        </p>

        ${detailTable("Player Details", playerRows)}
        ${detailTable("Parent / Guardian 1", parent1Rows)}
        ${parent2Rows.length ? detailTable("Parent / Guardian 2", parent2Rows) : ""}
        ${dynamicRows.length ? detailTable("Additional Information", dynamicRows) : ""}

        <h2 style="margin:28px 0 14px;font-size:16px;font-weight:700;color:#111827;border-top:1px solid #e5e7eb;padding-top:20px;">
          ${esc(t(locale, "register", "waiversTitle"))}
        </h2>
        ${waiversHtml || `<p style="color:#9ca3af;font-style:italic;">(No signed waivers)</p>`}

        <div style="margin-top:28px;padding-top:16px;border-top:1px solid #f3f4f6;text-align:center;">
          <span style="font-size:11px;color:#9ca3af;">Powered by </span>
          <span style="font-size:11px;color:#6b7280;font-weight:600;">EasyCoach.Club</span>
        </div>
      </div>
    </div>
  `;
}

/**
 * Sends the dedicated waiver-confirmation email (registration details +
 * full waiver text + signature info) to the registered parents.
 *
 * By default, idempotent — no-ops if `order.waiverConfirmationSentAt` is
 * already set. Pass `{ force: true }` to bypass that guard (used by the
 * admin "resend" action). Stamps `waiverConfirmationSentAt` on success.
 *
 * Failures are logged; this function never throws.
 *
 * NOTE: The PDF helper (`generateWaiverPDF` in src/lib/pdf.js) is kept
 * intact for future use. For now, all waiver + registration details are
 * embedded directly in the email body — no attachments.
 */
export async function sendWaiverConfirmationPDFEmail(order, { force = false } = {}) {
  try {
    await dbConnect();

    const orderDoc = typeof order?.save === "function"
      ? order
      : await Order.findById(order?._id);
    if (!orderDoc) return { ok: false, reason: "not_found" };

    if (!force && orderDoc.waiverConfirmationSentAt) {
      return { ok: true, skipped: "already_sent" };
    }

    const signedConsents = (orderDoc.waiverConsents || []).filter((c) => c.agreedAt);
    if (signedConsents.length === 0) return { ok: false, reason: "no_signed_waivers" };

    const [activity, club] = await Promise.all([
      Activity.findById(orderDoc.activityId, "title waivers formSections").lean(),
      Club.findById(orderDoc.clubId, "name logoUrl language smtpEmail smtpPassword smtpHost smtpPort").lean(),
    ]);
    if (!activity || !club) return { ok: false, reason: "missing_activity_or_club" };

    const locale = club.language || "en";
    const orderObj = typeof orderDoc.toObject === "function" ? orderDoc.toObject() : orderDoc;
    const playerName = `${orderObj.playerFirstName || ""} ${orderObj.playerLastName || ""}`.trim();
    const parentName = `${orderObj.parent1FirstName || ""} ${orderObj.parent1LastName || ""}`.trim();

    const html = buildWaiverConfirmationHtml({
      order: orderObj,
      activity,
      club,
      signedConsents,
      locale,
      playerName,
      parentName,
    });

    const recipients = [];
    if (orderObj.parent1Email) recipients.push(orderObj.parent1Email);
    if (orderObj.parent2Email && orderObj.parent2Email !== orderObj.parent1Email) {
      recipients.push(orderObj.parent2Email);
    }
    if (recipients.length === 0) return { ok: false, reason: "no_recipients" };

    const { transport, from } = getClubTransporter(club);
    const subject = t(locale, "email", "waiverConfirmSubject", {
      player: playerName,
      activity: activity.title || "",
    });

    let sentAny = false;
    for (const email of recipients) {
      try {
        await transport.sendMail({ from, to: email, subject, html });
        sentAny = true;
      } catch (e) {
        console.error(`Failed to send waiver email to ${email}:`, e.message);
      }
    }

    if (sentAny) {
      orderDoc.waiverConfirmationSentAt = new Date();
      try {
        await orderDoc.save();
      } catch (e) {
        console.error("Failed to stamp waiverConfirmationSentAt:", e.message);
      }
    }

    return { ok: sentAny, sentTo: recipients };
  } catch (error) {
    console.error("sendWaiverConfirmationPDFEmail error:", error);
    return { ok: false, reason: "exception" };
  }
}
