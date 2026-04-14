import { NextResponse } from "next/server";
import dbConnect from "@/lib/mongodb";
import Order from "@/models/Order";
import Activity from "@/models/Activity";
import Club from "@/models/Club";
import { generateWaiverPDF } from "@/lib/pdf";
import { getClubTransporter } from "@/lib/email";
import en from "@/messages/en.json";
import he from "@/messages/he.json";

const msgs = { en, he };
function t(locale, ns, key, reps = {}) {
  const msg = msgs[locale]?.[ns]?.[key] || msgs.en[ns]?.[key] || key;
  return Object.entries(reps).reduce((s, [k, v]) => s.replace(new RegExp(`\\{${k}\\}`, "g"), v), msg);
}

export async function POST(request, { params }) {
  try {
    const { activityId } = await params;
    const body = await request.json();
    const { token, orderId, waiverConsents } = body;

    if (!waiverConsents || waiverConsents.length === 0) {
      return NextResponse.json({ error: "No waivers" }, { status: 400 });
    }

    await dbConnect();

    let order;
    if (token) {
      order = await Order.findOne({ registrationToken: token, activityId });
    } else if (orderId) {
      order = await Order.findOne({ _id: orderId, activityId });
    }

    if (!order) {
      return NextResponse.json({ error: "Order not found" }, { status: 404 });
    }

    const existingWaiverIds = new Set((order.waiverConsents || []).filter(c => c.agreedAt).map(c => c.waiverId));
    const newConsents = waiverConsents.filter(c => c.agreedAt && !existingWaiverIds.has(c.waiverId));

    if (newConsents.length === 0) {
      return NextResponse.json({ ok: true, skipped: true });
    }

    const merged = [...(order.waiverConsents || [])];
    for (const nc of newConsents) {
      const idx = merged.findIndex(c => c.waiverId === nc.waiverId);
      if (idx >= 0) merged[idx] = nc;
      else merged.push(nc);
    }
    order.waiverConsents = merged;
    await order.save();

    const [activity, club] = await Promise.all([
      Activity.findById(activityId, "title waivers").lean(),
      Club.findById(order.clubId, "name logoUrl language smtpEmail smtpPassword smtpHost smtpPort").lean(),
    ]);

    if (!activity || !club) {
      return NextResponse.json({ ok: true });
    }

    const locale = club.language || "en";
    const playerName = `${order.playerFirstName} ${order.playerLastName}`.trim();
    const parentName = `${order.parent1FirstName} ${order.parent1LastName}`.trim();

    const pdfBuffer = await generateWaiverPDF({
      waiverConsents: merged.filter(c => c.agreedAt),
      waivers: activity.waivers || [],
      playerName,
      parentName,
      clubName: club.name,
      activityTitle: activity.title,
      clubLogoUrl: club.logoUrl,
    });

    const recipients = [];
    if (order.parent1Email) recipients.push(order.parent1Email);
    if (order.parent2Email && order.parent2Email !== order.parent1Email) recipients.push(order.parent2Email);

    const { transport, from } = getClubTransporter(club);
    const subject = t(locale, "email", "waiverConfirmSubject", { player: playerName, activity: activity.title });

    const signedList = merged.filter(c => c.agreedAt).map(c =>
      `<li><strong>${c.title || "Waiver"}</strong> — ${t(locale, "email", "waiverSignedBy", { name: c.agreedByName || parentName })} on ${new Date(c.agreedAt).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric", hour: "2-digit", minute: "2-digit" })}</li>`
    ).join("");

    const html = `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 520px; margin: 0 auto; padding: 40px 20px;">
        <h2 style="color: #111827; margin-bottom: 4px;">${t(locale, "email", "waiverConfirmTitle")}</h2>
        <p style="color: #6b7280; font-size: 14px; margin-bottom: 20px;">
          ${t(locale, "email", "waiverConfirmDesc", { player: `<strong>${playerName}</strong>`, activity: `<strong>${activity.title}</strong>` })}
        </p>
        <div style="background: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 8px; padding: 16px; margin-bottom: 20px;">
          <ul style="margin: 0; padding-left: 16px; font-size: 13px; color: #374151;">
            ${signedList}
          </ul>
        </div>
        <p style="color: #6b7280; font-size: 13px;">
          ${t(locale, "email", "waiverConfirmPdfNote")}
        </p>
        <div style="text-align:center;margin-top:24px;padding-top:16px;border-top:1px solid #e5e7eb;">
          <span style="font-size:11px;color:#9ca3af;">Powered by EasyCoach.Club</span>
        </div>
      </div>
    `;

    for (const email of recipients) {
      try {
        await transport.sendMail({
          from,
          to: email,
          subject,
          html,
          attachments: [{
            filename: `Waivers_${playerName.replace(/\s+/g, "_")}.pdf`,
            content: pdfBuffer,
            contentType: "application/pdf",
          }],
        });
      } catch (e) {
        console.error(`Failed to send waiver email to ${email}:`, e.message);
      }
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Waiver confirmation error:", error);
    return NextResponse.json({ error: "Failed to send waiver confirmation" }, { status: 500 });
  }
}
