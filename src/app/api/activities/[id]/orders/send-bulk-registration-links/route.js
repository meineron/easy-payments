import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import dbConnect from "@/lib/mongodb";
import mongoose from "mongoose";
import crypto from "crypto";
import Order from "@/models/Order";
import Activity from "@/models/Activity";
import Club from "@/models/Club";
import { sendCustomRegistrationEmail } from "@/lib/email";
import { sendSMS, toE164 } from "@/lib/sms";

function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

export async function POST(request, { params }) {
  try {
    const session = await getServerSession(authOptions);
    if (!session || session.user.role !== "club") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const { id } = await params;
    const body = await request.json();
    const { teamIds, subject, bodyHtml, channel = "email", smsText, smsNotification } = body;

    if (!teamIds?.length) {
      return NextResponse.json({ error: "Select at least one team" }, { status: 400 });
    }

    await dbConnect();

    const [activity, club] = await Promise.all([
      Activity.findById(id, "title").lean(),
      Club.findById(session.user.id, "name logoUrl language").lean(),
    ]);

    if (!activity || !club) {
      return NextResponse.json({ error: "Activity or club not found" }, { status: 404 });
    }

    const teamObjectIds = teamIds.map((t) => {
      try { return new mongoose.Types.ObjectId(t); } catch { return t; }
    });

    const filter = {
      activityId: id,
      clubId: session.user.id,
      teamId: { $in: teamObjectIds },
      parent1Email: { $exists: true, $ne: "" },
    };
    const orders = await Order.find(filter);

    if (orders.length === 0) {
      return NextResponse.json({ error: "No orders with parent emails found for selected teams" }, { status: 404 });
    }

    const baseUrl = process.env.NEXTAUTH_URL || "http://localhost:3000";
    let sentCount = 0;
    let errorCount = 0;

    for (const order of orders) {
      try {
        if (!order.registrationToken || (order.registrationTokenExpiresAt && order.registrationTokenExpiresAt < new Date())) {
          order.registrationToken = crypto.randomUUID();
          order.registrationTokenExpiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
        }
        order.linkSentAt = new Date();
        await order.save();

        const registrationUrl = `${baseUrl}/register/${id}?token=${order.registrationToken}`;

        const orderPhoneE164 = toE164(order.parent1PhonePrefix || "+1", order.parent1Phone);

        if (channel === "sms") {
          if (orderPhoneE164) {
            const text = (smsText || "").replace("{link}", registrationUrl);
            await sendSMS({ to: orderPhoneE164, message: text });
          }
        } else {
          await sendCustomRegistrationEmail(order.parent1Email, {
            subject: subject || `${activity.title} — Registration`,
            bodyHtml: bodyHtml || "<p>Please complete your registration.</p>",
            playerName: `${order.playerFirstName} ${order.playerLastName}`,
            clubName: club.name || "",
            activityTitle: activity.title || "",
            registrationUrl,
            logoUrl: club.logoUrl || null,
            locale: club.language || "en",
          });

          if (smsNotification && orderPhoneE164) {
            const smsBody = (body.smsText || `You have received an email. Subject: ${subject}`).replace(/\{email_subject\}/g, subject);
            try { await sendSMS({ to: orderPhoneE164, message: smsBody }); } catch { /* best effort */ }
          }
        }

        sentCount++;
        if (sentCount % 5 === 0) await sleep(500);
      } catch (err) {
        console.error(`Failed to send registration link to ${order.parent1Email}:`, err.message);
        errorCount++;
      }
    }

    return NextResponse.json({ success: true, sentCount, errorCount, total: orders.length });
  } catch (error) {
    console.error("Bulk registration link error:", error);
    return NextResponse.json({ error: "Failed to send registration links" }, { status: 500 });
  }
}
