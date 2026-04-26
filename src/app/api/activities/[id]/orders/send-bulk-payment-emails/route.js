import { NextResponse } from "next/server";
import mongoose from "mongoose";
import crypto from "crypto";
import { connectMain } from "@/lib/mongodb";
import { getClubContext, dualSave } from "@/lib/club-context";
import Club from "@/models/Club";
import { sendCustomPaymentEmail } from "@/lib/email";
import { sendSMS, toE164 } from "@/lib/sms";

function formatCents(c) { return "$" + ((c || 0) / 100).toFixed(2); }
function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

export async function POST(request, { params }) {
  try {
    const { ctx, error } = await getClubContext();
    if (error) return NextResponse.json(error.body, { status: error.status });
    const { Order, Activity } = ctx.models;

    const { id } = await params;
    const body = await request.json();
    const { teamIds, subject, bodyHtml, channel = "email", smsText, smsNotification } = body;

    if (!teamIds?.length) {
      return NextResponse.json({ error: "Select at least one team" }, { status: 400 });
    }

    await connectMain();
    const [activity, club] = await Promise.all([
      Activity.findById(id, "title").lean(),
      Club.findById(ctx.clubId, "name logoUrl language").lean(),
    ]);

    if (!activity || !club) {
      return NextResponse.json({ error: "Activity or club not found" }, { status: 404 });
    }

    const teamObjectIds = teamIds.map((t) => {
      try { return new mongoose.Types.ObjectId(t); } catch { return t; }
    });
    const filter = {
      activityId: id,
      clubId: ctx.clubId,
      teamId: { $in: teamObjectIds },
      status: { $ne: "paid" },
      parent1Email: { $exists: true, $ne: "" },
    };
    const orders = await Order.find(filter);

    if (orders.length === 0) {
      return NextResponse.json({ error: "No unpaid orders with parent emails found for selected teams" }, { status: 404 });
    }

    const baseUrl = process.env.NEXTAUTH_URL || "http://localhost:3000";
    let sentCount = 0;
    let errorCount = 0;

    for (const order of orders) {
      try {
        if (!order.paymentToken) {
          order.paymentToken = crypto.randomUUID();
        }
        order.paymentLinkSentAt = new Date();
        await dualSave(ctx, order);

        const paymentUrl = `${baseUrl}/payment/${order.paymentToken}`;
        const totalDue = order.totalCostCents - (order.paidCents || 0);

        const orderPhoneE164 = toE164(order.parent1PhonePrefix || "+1", order.parent1Phone);

        if (channel === "sms") {
          if (orderPhoneE164) {
            const text = (smsText || "").replace("{link}", paymentUrl);
            await sendSMS({ to: orderPhoneE164, message: text });
          }
        } else {
          await sendCustomPaymentEmail(order.parent1Email, {
            subject: subject || `${activity.title} — Payment`,
            bodyHtml: bodyHtml || "<p>Please complete your payment.</p>",
            playerName: `${order.playerFirstName} ${order.playerLastName}`,
            clubName: club.name || "",
            activityTitle: activity.title || "",
            paymentUrl,
            totalAmount: formatCents(totalDue > 0 ? totalDue : order.totalCostCents),
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
        console.error(`Failed to send to ${order.parent1Email}:`, err.message);
        errorCount++;
      }
    }

    return NextResponse.json({ success: true, sentCount, errorCount, total: orders.length });
  } catch (error) {
    console.error("Bulk payment email error:", error);
    return NextResponse.json({ error: "Failed to send payment emails" }, { status: 500 });
  }
}
