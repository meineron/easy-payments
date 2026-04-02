import nodemailer from "nodemailer";

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

export async function sendVerificationEmail(to, code) {
  const html = `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 480px; margin: 0 auto; padding: 40px 20px;">
      <h2 style="color: #111827; margin-bottom: 8px;">Verify your email</h2>
      <p style="color: #6b7280; font-size: 14px; margin-bottom: 24px;">
        Use the code below to complete your registration. This code expires in 10 minutes.
      </p>
      <div style="background: #f3f4f6; border-radius: 12px; padding: 24px; text-align: center; margin-bottom: 24px;">
        <span style="font-size: 32px; font-weight: 700; letter-spacing: 8px; color: #111827;">${code}</span>
      </div>
      <p style="color: #9ca3af; font-size: 12px;">
        If you didn't request this code, you can safely ignore this email.
      </p>
    </div>
  `;

  await transporter.sendMail({ from: FROM(), to, subject: `${code} is your verification code`, html });
}

export async function sendRegistrationLink(to, { playerName, clubName, activityTitle, registrationUrl }) {
  const html = `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 520px; margin: 0 auto; padding: 40px 20px;">
      <h2 style="color: #111827; margin-bottom: 8px;">Complete Registration</h2>
      <p style="color: #6b7280; font-size: 14px; margin-bottom: 4px;">
        ${clubName} has invited you to complete registration for <strong>${playerName}</strong>.
      </p>
      <p style="color: #6b7280; font-size: 14px; margin-bottom: 24px;">
        Activity: <strong>${activityTitle}</strong>
      </p>
      <div style="text-align: center; margin-bottom: 24px;">
        <a href="${registrationUrl}" style="display: inline-block; background: #2563eb; color: #fff; padding: 14px 32px; border-radius: 8px; text-decoration: none; font-weight: 600; font-size: 16px;">
          Complete Registration
        </a>
      </div>
      <p style="color: #9ca3af; font-size: 12px;">
        If you didn't expect this email, you can safely ignore it.
      </p>
    </div>
  `;

  await transporter.sendMail({ from: FROM(), to, subject: `Complete registration for ${playerName} — ${activityTitle}`, html });
}

export async function sendInvoiceEmail(to, { playerName, clubName, activityTitle, teamName, subscriptionTitle, items, totalCents, paidCents }) {
  function fmt(cents) { return "$" + ((cents || 0) / 100).toFixed(2); }
  const itemRows = (items || []).map((i) =>
    `<tr><td style="padding:6px 0;border-bottom:1px solid #f3f4f6;">${i.name}</td><td style="padding:6px 0;border-bottom:1px solid #f3f4f6;text-align:right;">${i.isDiscount ? "-" : ""}${fmt(Math.abs(i.priceCents) * (i.quantity || 1))}</td></tr>`
  ).join("");

  const html = `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 520px; margin: 0 auto; padding: 40px 20px;">
      <h2 style="color: #111827; margin-bottom: 4px;">Payment Confirmation</h2>
      <p style="color: #6b7280; font-size: 14px; margin-bottom: 24px;">
        Thank you for completing registration for <strong>${playerName}</strong>.
      </p>
      <div style="background: #f9fafb; border-radius: 12px; padding: 20px; margin-bottom: 24px;">
        <p style="margin:0 0 6px;font-size:13px;color:#6b7280;">Club: <strong style="color:#111827;">${clubName}</strong></p>
        <p style="margin:0 0 6px;font-size:13px;color:#6b7280;">Activity: <strong style="color:#111827;">${activityTitle}</strong></p>
        ${teamName ? `<p style="margin:0 0 6px;font-size:13px;color:#6b7280;">Team: <strong style="color:#111827;">${teamName}</strong></p>` : ""}
        ${subscriptionTitle ? `<p style="margin:0 0 6px;font-size:13px;color:#6b7280;">Subscription: <strong style="color:#111827;">${subscriptionTitle}</strong></p>` : ""}
      </div>
      <table style="width:100%;border-collapse:collapse;font-size:14px;margin-bottom:16px;">
        ${subscriptionTitle ? `<tr><td style="padding:6px 0;border-bottom:1px solid #f3f4f6;">${subscriptionTitle}</td><td style="padding:6px 0;border-bottom:1px solid #f3f4f6;text-align:right;">${fmt(paidCents)}</td></tr>` : ""}
        ${itemRows}
      </table>
      <div style="text-align:right;font-size:16px;font-weight:700;color:#111827;border-top:2px solid #111827;padding-top:8px;">
        Total Paid: ${fmt(paidCents)}
      </div>
      <p style="color: #9ca3af; font-size: 12px; margin-top: 24px;">
        This is your receipt. Keep it for your records.
      </p>
    </div>
  `;

  await transporter.sendMail({ from: FROM(), to, subject: `Payment receipt — ${playerName} — ${activityTitle}`, html });
}

export async function sendParentInvite(to, { parentName, clubName, inviteUrl }) {
  const html = `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 520px; margin: 0 auto; padding: 40px 20px;">
      <h2 style="color: #111827; margin-bottom: 8px;">You're Invited</h2>
      <p style="color: #6b7280; font-size: 14px; margin-bottom: 24px;">
        Hi ${parentName}, <strong>${clubName}</strong> has invited you to manage your child's registrations.
      </p>
      <div style="text-align: center; margin-bottom: 24px;">
        <a href="${inviteUrl}" style="display: inline-block; background: #2563eb; color: #fff; padding: 14px 32px; border-radius: 8px; text-decoration: none; font-weight: 600; font-size: 16px;">
          Accept Invitation
        </a>
      </div>
      <p style="color: #9ca3af; font-size: 12px;">
        If you didn't expect this email, you can safely ignore it.
      </p>
    </div>
  `;

  await transporter.sendMail({ from: FROM(), to, subject: `${clubName} invited you to EasyCoach`, html });
}

export async function sendPaymentLink(to, { playerName, clubName, activityTitle, paymentUrl, totalAmount }) {
  const html = `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 520px; margin: 0 auto; padding: 40px 20px;">
      <h2 style="color: #111827; margin-bottom: 8px;">Payment Required</h2>
      <p style="color: #6b7280; font-size: 14px; margin-bottom: 4px;">
        ${clubName} is requesting payment for <strong>${playerName}</strong>.
      </p>
      <p style="color: #6b7280; font-size: 14px; margin-bottom: 24px;">
        Activity: <strong>${activityTitle}</strong>${totalAmount ? ` — Amount: <strong>${totalAmount}</strong>` : ""}
      </p>
      <div style="text-align: center; margin-bottom: 24px;">
        <a href="${paymentUrl}" style="display: inline-block; background: #16a34a; color: #fff; padding: 14px 32px; border-radius: 8px; text-decoration: none; font-weight: 600; font-size: 16px;">
          Pay Now
        </a>
      </div>
      <p style="color: #9ca3af; font-size: 12px;">
        If you didn't expect this email, you can safely ignore it.
      </p>
    </div>
  `;

  await transporter.sendMail({ from: FROM(), to, subject: `Payment for ${playerName} — ${activityTitle}`, html });
}

export async function sendCustomPaymentEmail(to, { subject, bodyHtml, playerName, clubName, activityTitle, paymentUrl, totalAmount }) {
  const html = `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 520px; margin: 0 auto; padding: 40px 20px;">
      <h2 style="color: #111827; margin-bottom: 16px;">${clubName}</h2>
      <div style="color: #374151; font-size: 14px; line-height: 1.6; margin-bottom: 24px;">
        ${bodyHtml}
      </div>
      <div style="background: #f9fafb; border-radius: 12px; padding: 16px; margin-bottom: 24px; font-size: 14px;">
        <p style="margin:0 0 4px;color:#6b7280;">Player: <strong style="color:#111827;">${playerName}</strong></p>
        <p style="margin:0 0 4px;color:#6b7280;">Activity: <strong style="color:#111827;">${activityTitle}</strong></p>
        ${totalAmount ? `<p style="margin:0;color:#6b7280;">Amount Due: <strong style="color:#111827;">${totalAmount}</strong></p>` : ""}
      </div>
      <div style="text-align: center; margin-bottom: 24px;">
        <a href="${paymentUrl}" style="display: inline-block; background: #16a34a; color: #fff; padding: 14px 32px; border-radius: 8px; text-decoration: none; font-weight: 600; font-size: 16px;">
          Pay Now
        </a>
      </div>
      <p style="color: #9ca3af; font-size: 12px;">
        If you didn't expect this email, you can safely ignore it.
      </p>
    </div>
  `;

  await transporter.sendMail({ from: FROM(), to, subject, html });
}
