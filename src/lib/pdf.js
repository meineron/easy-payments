import PDFDocument from "pdfkit";
import path from "path";
import fs from "fs";

const EASYCOACH_LOGO_PATH = path.join(process.cwd(), "public", "easycoach-logo.png");

function stripHtml(html) {
  if (!html) return "";
  return html
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n")
    .replace(/<\/li>/gi, "\n")
    .replace(/<li>/gi, "  • ")
    .replace(/<[^>]+>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&nbsp;/g, " ")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function fmtDate(d) {
  if (!d) return "";
  const dt = new Date(d);
  return dt.toLocaleDateString("en-US", { year: "numeric", month: "2-digit", day: "2-digit" });
}

// DOBs are stored as "YYYY-MM-DD" strings and must render without any
// timezone conversion (otherwise the day can drift in runtimes like Heroku
// that run in UTC). See `src/lib/dob.js`.
function fmtDob(s) {
  if (!s) return "";
  if (typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s)) {
    const [y, m, d] = s.split("-").map(Number);
    return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("en-US", {
      year: "numeric", month: "2-digit", day: "2-digit", timeZone: "UTC",
    });
  }
  return fmtDate(s);
}

function fmtDateTime(d) {
  if (!d) return "";
  const dt = new Date(d);
  return dt.toLocaleString("en-US", {
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", timeZoneName: "short",
  });
}

function fmtDateLong(d) {
  if (!d) return "";
  const dt = new Date(d);
  return dt.toLocaleString("en-US", {
    year: "numeric", month: "long", day: "numeric",
    hour: "2-digit", minute: "2-digit", timeZoneName: "short",
  });
}

function fmtCents(c) {
  return "$" + ((c || 0) / 100).toFixed(2);
}

/**
 * Generates a registration confirmation PDF.
 * Returns a Buffer with the PDF content.
 */
export async function generateRegistrationPDF({
  order,
  activity,
  clubName,
  clubLogoUrl,
  waivers,
  locale = "en",
}) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: "A4", margins: { top: 50, bottom: 50, left: 50, right: 50 } });
    const chunks = [];
    doc.on("data", (chunk) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    const pageWidth = doc.page.width - doc.page.margins.left - doc.page.margins.right;
    const leftX = doc.page.margins.left;

    // ── Header: Club logo (left) + EasyCoach logo (right) ──
    const headerY = doc.y;
    let logoDrawn = false;

    if (clubLogoUrl) {
      try {
        const match = clubLogoUrl.match(/^data:image\/([a-zA-Z+]+);base64,(.+)$/);
        if (match) {
          const buf = Buffer.from(match[2], "base64");
          doc.image(buf, leftX, headerY, { height: 40 });
          logoDrawn = true;
        }
      } catch { /* skip club logo if can't render */ }
    }

    try {
      if (fs.existsSync(EASYCOACH_LOGO_PATH)) {
        doc.image(EASYCOACH_LOGO_PATH, doc.page.width - doc.page.margins.right - 120, headerY, { height: 30 });
      }
    } catch { /* skip easycoach logo */ }

    doc.y = headerY + 50;

    // ── Title ──
    doc.fontSize(18).font("Helvetica-Bold").fillColor("#111827")
      .text("Registration Confirmation", leftX, doc.y, { width: pageWidth, align: "center" });
    doc.moveDown(0.3);

    if (activity?.title) {
      doc.fontSize(12).font("Helvetica").fillColor("#6b7280")
        .text(activity.title, { width: pageWidth, align: "center" });
    }
    if (clubName) {
      doc.fontSize(10).fillColor("#9ca3af")
        .text(clubName, { width: pageWidth, align: "center" });
    }
    doc.moveDown(1);

    // ── Helper: section header ──
    function sectionHeader(title) {
      doc.moveDown(0.5);
      doc.fontSize(11).font("Helvetica-Bold").fillColor("#1e40af").text(title.toUpperCase());
      doc.moveTo(leftX, doc.y).lineTo(leftX + pageWidth, doc.y).strokeColor("#dbeafe").lineWidth(1).stroke();
      doc.moveDown(0.3);
    }

    function row(label, value) {
      if (!value) return;
      doc.fontSize(10).font("Helvetica-Bold").fillColor("#374151").text(`${label}: `, { continued: true });
      doc.font("Helvetica").fillColor("#111827").text(String(value));
    }

    // ── Player Details ──
    sectionHeader("Player Details");
    row("Name", `${order.playerFirstName} ${order.playerLastName}`);
    row("Date of Birth", fmtDob(order.playerDob));
    row("Gender", order.playerGender);
    row("Phone", order.playerPhone ? `${order.playerPhonePrefix || ""} ${order.playerPhone}` : null);
    row("Email", order.playerEmail);

    // ── Parent 1 ──
    if (order.parent1FirstName) {
      sectionHeader("Parent / Guardian 1");
      row("Name", `${order.parent1FirstName} ${order.parent1LastName}`);
      row("Phone", order.parent1Phone ? `${order.parent1PhonePrefix || ""} ${order.parent1Phone}` : null);
      row("Email", order.parent1Email);
    }

    // ── Parent 2 ──
    if (order.parent2FirstName) {
      sectionHeader("Parent / Guardian 2");
      row("Name", `${order.parent2FirstName} ${order.parent2LastName}`);
      row("Phone", order.parent2Phone ? `${order.parent2PhonePrefix || ""} ${order.parent2Phone}` : null);
      row("Email", order.parent2Email);
    }

    // ── Team & Subscription ──
    if (order.subscriptionTitle || order.teamName) {
      sectionHeader("Registration Details");
      row("Team", order.teamName);
      row("Subscription", order.subscriptionTitle);
    }

    // ── Invoice Summary ──
    sectionHeader("Invoice Summary");
    if (order.subscriptionTitle) {
      row(order.subscriptionTitle, fmtCents(order.subscriptionPriceCents));
    }
    if (order.items?.length > 0) {
      for (const item of order.items) {
        const amt = (item.priceCents || 0) * (item.quantity || 1);
        row(item.name, `${item.isDiscount ? "-" : ""}${fmtCents(Math.abs(amt))}`);
      }
    }
    doc.moveDown(0.3);
    doc.fontSize(11).font("Helvetica-Bold").fillColor("#111827")
      .text(`Total: ${fmtCents(order.totalCostCents)}`);

    if (order.paidCents > 0) {
      doc.fontSize(10).font("Helvetica").fillColor("#16a34a")
        .text(`Paid: ${fmtCents(order.paidCents)}`);
    }
    if (order.paidCents > 0 && order.paidCents < order.totalCostCents) {
      doc.fillColor("#dc2626")
        .text(`Balance Due: ${fmtCents(order.totalCostCents - order.paidCents)}`);
    }
    if (order.status === "paid") {
      doc.moveDown(0.3);
      doc.fontSize(10).font("Helvetica-Bold").fillColor("#16a34a")
        .text("FULLY PAID", { align: "center" });
    }

    // ── Waivers ──
    const consents = order.waiverConsents || [];
    if (consents.length > 0 || waivers?.length > 0) {
      sectionHeader("Waivers & Agreements");

      const waiverMap = {};
      (waivers || []).forEach((w) => { waiverMap[String(w._id)] = w; });

      for (const consent of consents) {
        const waiverDoc = waiverMap[consent.waiverId];
        doc.fontSize(10).font("Helvetica-Bold").fillColor("#111827")
          .text(consent.title || waiverDoc?.title || "Waiver");
        doc.moveDown(0.2);

        if (waiverDoc?.contentHtml) {
          const plain = stripHtml(waiverDoc.contentHtml);
          if (plain) {
            doc.fontSize(8).font("Helvetica").fillColor("#6b7280")
              .text(plain, { width: pageWidth });
            doc.moveDown(0.3);
          }
        }

        doc.fontSize(9).font("Helvetica").fillColor("#374151");
        if (consent.agreedByName) {
          doc.text(`Signed by: ${consent.agreedByName}${consent.agreedByEmail ? ` (${consent.agreedByEmail})` : ""}`);
        }
        if (consent.agreedAt) {
          doc.text(`Date & Time: ${fmtDateTime(consent.agreedAt)}`);
        }
        doc.moveDown(0.5);

        if (doc.y > doc.page.height - 100) {
          doc.addPage();
        }
      }
    }

    // ── Footer ──
    doc.moveDown(1);
    doc.fontSize(8).font("Helvetica").fillColor("#9ca3af")
      .text(`Generated on ${fmtDateTime(new Date())}`, { width: pageWidth, align: "center" });
    doc.text("Powered by EasyCoach.Club", { width: pageWidth, align: "center" });

    doc.end();
  });
}

// Keys already rendered in the Player Details block — skip them when listing
// dynamic form answers so we don't double-print first name / DOB / etc.
const BUILTIN_PLAYER_KEYS = new Set([
  "firstName", "lastName", "dob", "dateOfBirth", "gender",
  "phone", "phoneNumber", "phonePrefix", "email",
]);

/**
 * Generates a waiver confirmation PDF.
 * Contains registration details (player + parents + dynamic form answers)
 * followed by each waiver title, full text, and signature details.
 */
export async function generateWaiverPDF({
  waiverConsents,
  waivers,
  playerName,
  parentName,
  clubName,
  activityTitle,
  clubLogoUrl,
  order,
  formSections,
}) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: "A4", margins: { top: 50, bottom: 50, left: 50, right: 50 } });
    const chunks = [];
    doc.on("data", (chunk) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    const pageWidth = doc.page.width - doc.page.margins.left - doc.page.margins.right;
    const leftX = doc.page.margins.left;

    const headerY = doc.y;
    if (clubLogoUrl) {
      try {
        const match = clubLogoUrl.match(/^data:image\/([a-zA-Z+]+);base64,(.+)$/);
        if (match) {
          const buf = Buffer.from(match[2], "base64");
          doc.image(buf, leftX, headerY, { height: 40 });
        }
      } catch { /* skip */ }
    }
    try {
      if (fs.existsSync(EASYCOACH_LOGO_PATH)) {
        doc.image(EASYCOACH_LOGO_PATH, doc.page.width - doc.page.margins.right - 120, headerY, { height: 30 });
      }
    } catch { /* skip */ }
    doc.y = headerY + 50;

    doc.fontSize(18).font("Helvetica-Bold").fillColor("#111827")
      .text("Waiver Confirmation", leftX, doc.y, { width: pageWidth, align: "center" });
    doc.moveDown(0.3);
    if (activityTitle) {
      doc.fontSize(12).font("Helvetica").fillColor("#6b7280")
        .text(activityTitle, { width: pageWidth, align: "center" });
    }
    if (clubName) {
      doc.fontSize(10).fillColor("#9ca3af")
        .text(clubName, { width: pageWidth, align: "center" });
    }
    doc.moveDown(1);

    // ── Shared helpers ──
    function sectionHeader(title) {
      doc.moveDown(0.5);
      doc.fontSize(11).font("Helvetica-Bold").fillColor("#1e40af").text(title.toUpperCase());
      doc.moveTo(leftX, doc.y).lineTo(leftX + pageWidth, doc.y).strokeColor("#dbeafe").lineWidth(1).stroke();
      doc.moveDown(0.3);
    }
    function row(label, value) {
      if (value === null || value === undefined || value === "") return;
      doc.fontSize(10).font("Helvetica-Bold").fillColor("#374151").text(`${label}: `, { continued: true });
      doc.font("Helvetica").fillColor("#111827").text(String(value));
    }

    // ── Registration Details (player, parents, dynamic form answers) ──
    if (order) {
      sectionHeader("Player Details");
      row("Name", `${order.playerFirstName || ""} ${order.playerLastName || ""}`.trim());
      row("Date of Birth", fmtDob(order.playerDob));
      row("Gender", order.playerGender);
      row("Phone", order.playerPhone ? `${order.playerPhonePrefix || ""} ${order.playerPhone}`.trim() : null);
      row("Email", order.playerEmail);

      if (order.parent1FirstName || order.parent1Email) {
        sectionHeader("Parent / Guardian 1");
        row("Name", `${order.parent1FirstName || ""} ${order.parent1LastName || ""}`.trim());
        row("Phone", order.parent1Phone ? `${order.parent1PhonePrefix || ""} ${order.parent1Phone}`.trim() : null);
        row("Email", order.parent1Email);
      }

      if (order.parent2FirstName || order.parent2Email) {
        sectionHeader("Parent / Guardian 2");
        row("Name", `${order.parent2FirstName || ""} ${order.parent2LastName || ""}`.trim());
        row("Phone", order.parent2Phone ? `${order.parent2PhonePrefix || ""} ${order.parent2Phone}`.trim() : null);
        row("Email", order.parent2Email);
      }

      const formData = order.formData || {};
      const extraRows = [];
      for (const section of (formSections || [])) {
        for (const field of (section.fields || [])) {
          if (field.hidden) continue;
          if (field.type === "title_description") continue;
          if (field.isDefault && BUILTIN_PLAYER_KEYS.has(field.key)) continue;
          const raw = formData[field.key];
          if (raw === undefined || raw === null || raw === "") continue;
          const value = Array.isArray(raw) ? raw.join(", ") : String(raw);
          if (!value) continue;
          extraRows.push({ label: field.label || field.key, value });
        }
      }
      if (extraRows.length > 0) {
        sectionHeader("Additional Information");
        for (const r of extraRows) row(r.label, r.value);
      }

      doc.moveDown(0.6);
    } else if (playerName) {
      doc.fontSize(10).font("Helvetica").fillColor("#374151")
        .text(`Player: ${playerName}`, { width: pageWidth, align: "center" });
      doc.moveDown(1);
    }

    // Silence unused-var warning when caller only passed the legacy parentName.
    void parentName;

    const waiverMap = {};
    (waivers || []).forEach((w) => { waiverMap[String(w._id)] = w; });

    for (const consent of (waiverConsents || [])) {
      if (!consent.agreedAt) continue;

      const waiverDoc = waiverMap[consent.waiverId];

      if (doc.y > doc.page.height - 150) doc.addPage();

      doc.moveDown(0.5);
      doc.fontSize(13).font("Helvetica-Bold").fillColor("#1e40af")
        .text(consent.title || waiverDoc?.title || "Waiver");
      doc.moveTo(leftX, doc.y).lineTo(leftX + pageWidth, doc.y).strokeColor("#dbeafe").lineWidth(1).stroke();
      doc.moveDown(0.4);

      if (waiverDoc?.contentHtml) {
        const plain = stripHtml(waiverDoc.contentHtml);
        if (plain) {
          doc.fontSize(9).font("Helvetica").fillColor("#374151")
            .text(plain, { width: pageWidth });
          doc.moveDown(0.5);
        }
      }

      doc.moveDown(0.3);
      doc.moveTo(leftX, doc.y).lineTo(leftX + pageWidth, doc.y).strokeColor("#e5e7eb").lineWidth(0.5).stroke();
      doc.moveDown(0.3);

      doc.fontSize(10).font("Helvetica-Bold").fillColor("#111827")
        .text("Signature", leftX, doc.y);
      doc.moveDown(0.2);
      doc.fontSize(10).font("Helvetica").fillColor("#374151");
      if (consent.agreedByName) {
        doc.text(`Accepted by: ${consent.agreedByName}${consent.agreedByEmail ? ` (${consent.agreedByEmail})` : ""}`);
      }
      if (consent.agreedAt) {
        doc.text(`Accepted at: ${fmtDateLong(consent.agreedAt)}`);
      }
      doc.moveDown(1);
    }

    doc.moveDown(1);
    doc.fontSize(8).font("Helvetica").fillColor("#9ca3af")
      .text(`Generated on ${fmtDateTime(new Date())}`, { width: pageWidth, align: "center" });
    doc.text("Powered by EasyCoach.Club", { width: pageWidth, align: "center" });

    doc.end();
  });
}
