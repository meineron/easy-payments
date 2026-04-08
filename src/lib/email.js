import nodemailer from "nodemailer";
import en from "@/messages/en.json";
import he from "@/messages/he.json";

const messages = { en, he };
function t(locale, namespace, key, replacements = {}) {
  const msg = messages[locale]?.[namespace]?.[key] || messages.en[namespace]?.[key] || key;
  return Object.entries(replacements).reduce(
    (str, [k, v]) => str.replace(new RegExp(`\\{${k}\\}`, "g"), v),
    msg,
  );
}

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: parseInt(process.env.EMAIL_PORT || "587", 10),
  secure: false,
  auth: {
    user: process.env.EASYCOACH_EMAIL,
    pass: process.env.EASYCOACH_EMAIL_PASSWORD,
  },
});

const FROM = () => `"EasyCoach" <${process.env.EASYCOACH_EMAIL}>`;

export function getClubTransporter(club) {
  if (club?.smtpEmail && club?.smtpPassword) {
    return {
      transport: nodemailer.createTransport({
        host: club.smtpHost || "smtp.gmail.com",
        port: parseInt(club.smtpPort || "587", 10),
        secure: parseInt(club.smtpPort || "587", 10) === 465,
        auth: { user: club.smtpEmail, pass: club.smtpPassword },
      }),
      from: `"${club.name || "Club"}" <${club.smtpEmail}>`,
    };
  }
  return { transport: transporter, from: FROM() };
}

export async function sendBulkEmail({ club, subject, bodyHtml, bccList, logoUrl }) {
  const { transport, from } = getClubTransporter(club);

  const attachments = [];
  let processedBody = bodyHtml;

  const dataUriRegex = /(<img[^>]*\s+src=["'])(data:image\/([a-zA-Z+]+);base64,([^"']+))(["'][^>]*>)/g;
  let match;
  let idx = 0;
  while ((match = dataUriRegex.exec(bodyHtml)) !== null) {
    const cid = `img${idx}_${Date.now()}@email`;
    const ext = match[3].replace("+xml", "").replace("jpeg", "jpg");
    attachments.push({ filename: `image${idx}.${ext}`, content: Buffer.from(match[4], "base64"), cid });
    processedBody = processedBody.replace(match[2], `cid:${cid}`);
    idx++;
  }

  if (logoUrl) {
    const logo = prepareLogoHeader(logoUrl, club?.name);
    attachments.push(...logo.attachments);
    processedBody = `${logo.html}<div style="color:#374151;font-size:14px;line-height:1.6;">${processedBody}</div>`;
  } else {
    processedBody = `<div style="color:#374151;font-size:14px;line-height:1.6;">${processedBody}</div>`;
  }

  const html = `<div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;max-width:600px;margin:0 auto;padding:40px 20px;">${processedBody}</div>`;

  await transport.sendMail({
    from,
    to: from,
    bcc: bccList,
    subject,
    html,
    attachments,
  });

  return from;
}

function getDir(locale) { return locale === "he" ? "rtl" : "ltr"; }

function prepareLogoHeader(logoUrl, clubName) {
  const nameHtml = clubName ? `<h2 style="color: #111827; margin-bottom: 8px; text-align:center;">${clubName}</h2>` : "";
  if (!logoUrl) return { html: nameHtml, attachments: [] };

  const dataMatch = logoUrl.match(/^data:image\/([a-zA-Z+]+);base64,(.+)$/);
  if (dataMatch) {
    const cid = `clublogo_${Date.now()}@email`;
    const ext = dataMatch[1].replace("+xml", "").replace("jpeg", "jpg");
    const attachment = { filename: `logo.${ext}`, content: Buffer.from(dataMatch[2], "base64"), cid };
    const html = `<div style="text-align:center;margin-bottom:16px;"><img src="cid:${cid}" alt="${clubName || ""}" style="max-height:60px;max-width:200px;display:inline-block;" /></div>${nameHtml}`;
    return { html, attachments: [attachment] };
  }

  const html = `<div style="text-align:center;margin-bottom:16px;"><img src="${logoUrl}" alt="${clubName || ""}" style="max-height:60px;max-width:200px;display:inline-block;" /></div>${nameHtml}`;
  return { html, attachments: [] };
}

export async function sendVerificationEmail(to, code, locale = "en") {
  const dir = getDir(locale);
  const html = `
    <div dir="${dir}" style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 480px; margin: 0 auto; padding: 40px 20px; direction: ${dir};">
      <h2 style="color: #111827; margin-bottom: 8px;">${t(locale, "email", "verifyTitle")}</h2>
      <p style="color: #6b7280; font-size: 14px; margin-bottom: 24px;">
        ${t(locale, "email", "verifyDesc")}
      </p>
      <div style="background: #f3f4f6; border-radius: 12px; padding: 24px; text-align: center; margin-bottom: 24px;">
        <span style="font-size: 32px; font-weight: 700; letter-spacing: 8px; color: #111827; direction: ltr; display: inline-block;">${code}</span>
      </div>
      <p style="color: #9ca3af; font-size: 12px;">
        ${t(locale, "email", "verifyIgnore")}
      </p>
    </div>
  `;

  await transporter.sendMail({ from: FROM(), to, subject: t(locale, "email", "verifySubject", { code }), html });
}

export async function sendRegistrationLink(to, { playerName, clubName, activityTitle, registrationUrl, logoUrl, locale = "en" }) {
  const dir = getDir(locale);
  const logo = prepareLogoHeader(logoUrl, null);
  const html = `
    <div dir="${dir}" style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 520px; margin: 0 auto; padding: 40px 20px; direction: ${dir};">
      ${logo.html}
      <h2 style="color: #111827; margin-bottom: 8px;">${t(locale, "email", "regLinkTitle")}</h2>
      <p style="color: #6b7280; font-size: 14px; margin-bottom: 4px;">
        ${t(locale, "email", "regLinkDesc", { club: clubName, player: `<strong>${playerName}</strong>` })}
      </p>
      <p style="color: #6b7280; font-size: 14px; margin-bottom: 24px;">
        ${t(locale, "email", "regLinkActivity", { activity: `<strong>${activityTitle}</strong>` })}
      </p>
      <div style="text-align: center; margin-bottom: 24px;">
        <a href="${registrationUrl}" style="display: inline-block; background: #2563eb; color: #fff; padding: 14px 32px; border-radius: 8px; text-decoration: none; font-weight: 600; font-size: 16px;">
          ${t(locale, "email", "regLinkButton")}
        </a>
      </div>
      <p style="color: #9ca3af; font-size: 12px;">
        ${t(locale, "email", "regLinkIgnore")}
      </p>
    </div>
  `;

  await transporter.sendMail({ from: FROM(), to, subject: t(locale, "email", "regSubject", { player: playerName, activity: activityTitle }), html, attachments: logo.attachments });
}

export async function sendInvoiceEmail(to, { playerName, clubName, activityTitle, teamName, subscriptionTitle, items, totalCents, paidCents, logoUrl, locale = "en" }) {
  const dir = getDir(locale);
  function fmt(cents) { return "$" + ((cents || 0) / 100).toFixed(2); }
  const itemRows = (items || []).map((i) =>
    `<tr><td style="padding:6px 0;border-bottom:1px solid #f3f4f6;">${i.name}</td><td style="padding:6px 0;border-bottom:1px solid #f3f4f6;text-align:${dir === "rtl" ? "left" : "right"};">${i.isDiscount ? "-" : ""}${fmt(Math.abs(i.priceCents) * (i.quantity || 1))}</td></tr>`
  ).join("");

  const logo = prepareLogoHeader(logoUrl, null);
  const html = `
    <div dir="${dir}" style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 520px; margin: 0 auto; padding: 40px 20px; direction: ${dir};">
      ${logo.html}
      <h2 style="color: #111827; margin-bottom: 4px;">${t(locale, "email", "invoiceTitle")}</h2>
      <p style="color: #6b7280; font-size: 14px; margin-bottom: 24px;">
        ${t(locale, "email", "invoiceDesc", { player: `<strong>${playerName}</strong>` })}
      </p>
      <div style="background: #f9fafb; border-radius: 12px; padding: 20px; margin-bottom: 24px;">
        <p style="margin:0 0 6px;font-size:13px;color:#6b7280;">${t(locale, "email", "invoiceClub")} <strong style="color:#111827;">${clubName}</strong></p>
        <p style="margin:0 0 6px;font-size:13px;color:#6b7280;">${t(locale, "email", "invoiceActivity")} <strong style="color:#111827;">${activityTitle}</strong></p>
        ${teamName ? `<p style="margin:0 0 6px;font-size:13px;color:#6b7280;">${t(locale, "email", "invoiceTeam")} <strong style="color:#111827;">${teamName}</strong></p>` : ""}
        ${subscriptionTitle ? `<p style="margin:0 0 6px;font-size:13px;color:#6b7280;">${t(locale, "email", "invoiceSubscription")} <strong style="color:#111827;">${subscriptionTitle}</strong></p>` : ""}
      </div>
      <table style="width:100%;border-collapse:collapse;font-size:14px;margin-bottom:16px;">
        ${subscriptionTitle ? `<tr><td style="padding:6px 0;border-bottom:1px solid #f3f4f6;">${subscriptionTitle}</td><td style="padding:6px 0;border-bottom:1px solid #f3f4f6;text-align:${dir === "rtl" ? "left" : "right"};">${fmt(paidCents)}</td></tr>` : ""}
        ${itemRows}
      </table>
      <div style="text-align:${dir === "rtl" ? "left" : "right"};font-size:16px;font-weight:700;color:#111827;border-top:2px solid #111827;padding-top:8px;">
        ${t(locale, "email", "invoiceTotalPaid")} ${fmt(paidCents)}
      </div>
      <p style="color: #9ca3af; font-size: 12px; margin-top: 24px;">
        ${t(locale, "email", "invoiceReceipt")}
      </p>
    </div>
  `;

  await transporter.sendMail({ from: FROM(), to, subject: t(locale, "email", "invoiceSubject", { player: playerName, activity: activityTitle }), html, attachments: logo.attachments });
}

export async function sendParentInvite(to, { parentName, clubName, inviteUrl, logoUrl, locale = "en" }) {
  const dir = getDir(locale);
  const logo = prepareLogoHeader(logoUrl, null);
  const html = `
    <div dir="${dir}" style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 520px; margin: 0 auto; padding: 40px 20px; direction: ${dir};">
      ${logo.html}
      <h2 style="color: #111827; margin-bottom: 8px;">${t(locale, "email", "inviteTitle")}</h2>
      <p style="color: #6b7280; font-size: 14px; margin-bottom: 24px;">
        ${t(locale, "email", "inviteDesc", { parent: parentName, club: `<strong>${clubName}</strong>` })}
      </p>
      <div style="text-align: center; margin-bottom: 24px;">
        <a href="${inviteUrl}" style="display: inline-block; background: #2563eb; color: #fff; padding: 14px 32px; border-radius: 8px; text-decoration: none; font-weight: 600; font-size: 16px;">
          ${t(locale, "email", "inviteButton")}
        </a>
      </div>
      <p style="color: #9ca3af; font-size: 12px;">
        ${t(locale, "email", "inviteIgnore")}
      </p>
    </div>
  `;

  await transporter.sendMail({ from: FROM(), to, subject: t(locale, "email", "inviteSubject", { club: clubName }), html, attachments: logo.attachments });
}

export async function sendPaymentLink(to, { playerName, clubName, activityTitle, paymentUrl, totalAmount, logoUrl, locale = "en" }) {
  const dir = getDir(locale);
  const logo = prepareLogoHeader(logoUrl, null);
  const html = `
    <div dir="${dir}" style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 520px; margin: 0 auto; padding: 40px 20px; direction: ${dir};">
      ${logo.html}
      <h2 style="color: #111827; margin-bottom: 8px;">${t(locale, "email", "paymentTitle")}</h2>
      <p style="color: #6b7280; font-size: 14px; margin-bottom: 4px;">
        ${t(locale, "email", "paymentDesc", { club: clubName, player: `<strong>${playerName}</strong>` })}
      </p>
      <p style="color: #6b7280; font-size: 14px; margin-bottom: 24px;">
        ${t(locale, "email", "paymentActivity", { activity: `<strong>${activityTitle}</strong>` })}${totalAmount ? ` — ${t(locale, "email", "paymentAmount", { amount: `<strong>${totalAmount}</strong>` })}` : ""}
      </p>
      <div style="text-align: center; margin-bottom: 24px;">
        <a href="${paymentUrl}" style="display: inline-block; background: #16a34a; color: #fff; padding: 14px 32px; border-radius: 8px; text-decoration: none; font-weight: 600; font-size: 16px;">
          ${t(locale, "email", "payNowButton")}
        </a>
      </div>
      <p style="color: #9ca3af; font-size: 12px;">
        ${t(locale, "email", "paymentIgnore")}
      </p>
    </div>
  `;

  await transporter.sendMail({ from: FROM(), to, subject: t(locale, "email", "paymentSubject", { player: playerName, activity: activityTitle }), html, attachments: logo.attachments });
}

export async function sendCustomPaymentEmail(to, { subject, bodyHtml, playerName, clubName, activityTitle, paymentUrl, totalAmount, logoUrl, locale = "en" }) {
  const dir = getDir(locale);
  const attachments = [];
  let processedBody = bodyHtml;

  const dataUriRegex = /(<img[^>]*\s+src=["'])(data:image\/([a-zA-Z+]+);base64,([^"']+))(["'][^>]*>)/g;
  let match;
  let idx = 0;
  while ((match = dataUriRegex.exec(bodyHtml)) !== null) {
    const cid = `img${idx}_${Date.now()}@email`;
    const ext = match[3].replace("+xml", "").replace("jpeg", "jpg");
    attachments.push({
      filename: `image${idx}.${ext}`,
      content: Buffer.from(match[4], "base64"),
      cid,
    });
    processedBody = processedBody.replace(match[2], `cid:${cid}`);
    idx++;
  }

  const logo = prepareLogoHeader(logoUrl, clubName);
  attachments.push(...logo.attachments);

  const html = `
    <div dir="${dir}" style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 520px; margin: 0 auto; padding: 40px 20px; direction: ${dir};">
      ${logo.html}
      <div style="color: #374151; font-size: 14px; line-height: 1.6; margin-bottom: 24px;">
        ${processedBody}
      </div>
      <div style="background: #f9fafb; border-radius: 12px; padding: 16px; margin-bottom: 24px; font-size: 14px;">
        <p style="margin:0 0 4px;color:#6b7280;">${t(locale, "email", "paymentPlayer")} <strong style="color:#111827;">${playerName}</strong></p>
        <p style="margin:0 0 4px;color:#6b7280;">${t(locale, "email", "invoiceActivity")} <strong style="color:#111827;">${activityTitle}</strong></p>
        ${totalAmount ? `<p style="margin:0;color:#6b7280;">${t(locale, "email", "paymentAmount", { amount: `<strong style="color:#111827;">${totalAmount}</strong>` })}</p>` : ""}
      </div>
      <div style="text-align: center; margin-bottom: 24px;">
        <a href="${paymentUrl}" style="display: inline-block; background: #16a34a; color: #fff; padding: 14px 32px; border-radius: 8px; text-decoration: none; font-weight: 600; font-size: 16px;">
          ${t(locale, "email", "payNowButton")}
        </a>
      </div>
      <p style="color: #9ca3af; font-size: 12px;">
        ${t(locale, "email", "paymentIgnore")}
      </p>
    </div>
  `;

  await transporter.sendMail({ from: FROM(), to, subject, html, attachments });
}
