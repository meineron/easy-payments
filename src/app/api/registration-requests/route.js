import { NextResponse } from "next/server";
import { connectMain } from "@/lib/mongodb";
import { getClubContext, getClubContextById, dualCreate } from "@/lib/club-context";
import Club from "@/models/Club";
import { getClubTransporter } from "@/lib/email";
import en from "@/messages/en.json";
import he from "@/messages/he.json";

const msgs = { en, he };
function t(locale, ns, key, reps = {}) {
  const msg = msgs[locale]?.[ns]?.[key] || msgs.en[ns]?.[key] || key;
  return Object.entries(reps).reduce((s, [k, v]) => s.replace(new RegExp(`\\{${k}\\}`, "g"), v), msg);
}

export async function POST(request) {
  try {
    const body = await request.json();
    const { activityId, orderId, clubId, playerName, parentName, parentEmail, parentPhone, subject, message } = body;

    if (!activityId || !orderId || !clubId || !subject?.trim() || !message?.trim()) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    const ctx = await getClubContextById(clubId);

    const req = await dualCreate(ctx, "RegistrationRequest", {
      activityId,
      orderId,
      clubId,
      playerName: playerName || "",
      parentName: parentName || "",
      parentEmail: parentEmail || "",
      parentPhone: parentPhone || "",
      subject: subject.trim(),
      message: message.trim(),
    });

    await connectMain();
    const club = await Club.findById(clubId, "name supportEmail smtpEmail smtpPassword smtpHost smtpPort language").lean();
    const targetEmail = club?.supportEmail || club?.smtpEmail;

    if (targetEmail) {
      try {
        const locale = club?.language || "en";
        const { transport, from } = getClubTransporter(club);
        await transport.sendMail({
          from,
          to: targetEmail,
          subject: `[Request] ${subject.trim()} — ${parentName || "Parent"}`,
          html: `<p><strong>${t(locale, "requests", "from")}:</strong> ${parentName || ""} (${parentEmail || ""}, ${parentPhone || ""})</p>
<p><strong>${t(locale, "requests", "player")}:</strong> ${playerName || ""}</p>
<p><strong>${t(locale, "requests", "subject")}:</strong> ${subject}</p>
<hr/>
<p>${message.replace(/\n/g, "<br/>")}</p>`,
        });
      } catch (emailErr) {
        console.error("Failed to send request notification email:", emailErr);
      }
    }

    return NextResponse.json({ request: req });
  } catch (error) {
    console.error("Create registration request error:", error);
    return NextResponse.json({ error: "Failed to submit request" }, { status: 500 });
  }
}

export async function GET(request) {
  try {
    const { ctx, error } = await getClubContext();
    if (error) return NextResponse.json(error.body, { status: error.status });
    const { RegistrationRequest } = ctx.models;

    const { searchParams } = new URL(request.url);
    const activityId = searchParams.get("activityId");

    const filter = { clubId: ctx.clubId };
    if (activityId) filter.activityId = activityId;

    const requests = await RegistrationRequest.find(filter)
      .sort({ createdAt: -1 })
      .lean();

    return NextResponse.json({ requests });
  } catch (error) {
    console.error("Get registration requests error:", error);
    return NextResponse.json({ error: "Failed to load requests" }, { status: 500 });
  }
}
