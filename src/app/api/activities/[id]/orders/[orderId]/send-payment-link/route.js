import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import dbConnect from "@/lib/mongodb";
import Order from "@/models/Order";
import Activity from "@/models/Activity";
import Club from "@/models/Club";
import crypto from "crypto";
import { sendPaymentLink as sendPaymentLinkEmail } from "@/lib/email";
import { sendSMS, toE164 } from "@/lib/sms";

function formatCents(c) { return "$" + ((c || 0) / 100).toFixed(2); }

function getContactForTarget(order, target) {
  if (target === "player") {
    return {
      email: order.playerEmail || "",
      phone: toE164(order.playerPhonePrefix || "+1", order.playerPhone),
      name: `${order.playerFirstName} ${order.playerLastName}`,
    };
  }
  if (target === "parent2") {
    return {
      email: order.parent2Email || "",
      phone: toE164(order.parent2PhonePrefix || "+1", order.parent2Phone),
      name: order.parent2FirstName ? `${order.parent2FirstName} ${order.parent2LastName}` : "",
    };
  }
  return {
    email: order.parent1Email || "",
    phone: toE164(order.parent1PhonePrefix || "+1", order.parent1Phone),
    name: order.parent1FirstName ? `${order.parent1FirstName} ${order.parent1LastName}` : "",
  };
}

export async function POST(request, { params }) {
  try {
    const session = await getServerSession(authOptions);
    if (!session || session.user.role !== "club") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const { id, orderId } = await params;
    await dbConnect();

    const order = await Order.findOne({ _id: orderId, activityId: id, clubId: session.user.id });
    if (!order) return NextResponse.json({ error: "Order not found" }, { status: 404 });
    if (order.status === "paid") return NextResponse.json({ error: "Already paid" }, { status: 400 });

    if (!order.paymentToken) {
      order.paymentToken = crypto.randomUUID();
    }
    order.paymentLinkSentAt = new Date();
    await order.save();

    const baseUrl = process.env.NEXTAUTH_URL || "http://localhost:3000";
    const paymentUrl = `${baseUrl}/payment/${order.paymentToken}`;
    const totalDue = order.totalCostCents - (order.paidCents || 0);

    let body = {};
    try { body = await request.json(); } catch { /* empty body ok */ }

    const recipients = body.recipients || [];

    if (recipients.length > 0) {
      const [activity, club] = await Promise.all([
        Activity.findById(id, "title").lean(),
        Club.findById(session.user.id, "name logoUrl language").lean(),
      ]);
      const results = { sent: 0, failed: 0, errors: [] };

      for (const r of recipients) {
        const contact = getContactForTarget(order, r.target);
        try {
          if (r.channel === "sms") {
            if (!contact.phone) { results.failed++; results.errors.push(`No phone for ${r.target}`); continue; }
            const smsBody = body.bodyText || `Payment of ${formatCents(totalDue > 0 ? totalDue : order.totalCostCents)} requested. Pay here: ${paymentUrl}`;
            await sendSMS({ to: contact.phone, message: smsBody });
            results.sent++;
          } else if (r.channel === "email") {
            if (!contact.email) { results.failed++; results.errors.push(`No email for ${r.target}`); continue; }
            await sendPaymentLinkEmail(contact.email, {
              playerName: `${order.playerFirstName} ${order.playerLastName}`,
              clubName: club?.name || "",
              activityTitle: activity?.title || "",
              paymentUrl,
              totalAmount: formatCents(totalDue > 0 ? totalDue : order.totalCostCents),
              logoUrl: club?.logoUrl || null,
              locale: club?.language || "en",
            });
            results.sent++;
          }
        } catch (err) {
          results.failed++;
          results.errors.push(`${r.target} ${r.channel}: ${err.message}`);
        }
      }

      return NextResponse.json({ success: true, paymentUrl, paymentLinkSentAt: order.paymentLinkSentAt, results });
    }

    const { channel } = body;

    if (channel === "sms") {
      const phone = toE164(order.parent1PhonePrefix || "+1", order.parent1Phone);
      if (!phone) return NextResponse.json({ error: "No phone number" }, { status: 400 });
      const smsBody = body.bodyText || `Payment of ${formatCents(totalDue > 0 ? totalDue : order.totalCostCents)} requested. Pay here: ${paymentUrl}`;
      await sendSMS({ to: phone, message: smsBody });
    } else if (channel === "email") {
      if (!order.parent1Email) return NextResponse.json({ error: "No email address" }, { status: 400 });

      const [activity, club] = await Promise.all([
        Activity.findById(id, "title").lean(),
        Club.findById(session.user.id, "name logoUrl language").lean(),
      ]);

      await sendPaymentLinkEmail(order.parent1Email, {
        playerName: `${order.playerFirstName} ${order.playerLastName}`,
        clubName: club?.name || "",
        activityTitle: activity?.title || "",
        paymentUrl,
        totalAmount: formatCents(totalDue > 0 ? totalDue : order.totalCostCents),
        logoUrl: club?.logoUrl || null,
        locale: club?.language || "en",
      });
    }

    return NextResponse.json({ success: true, paymentUrl, paymentLinkSentAt: order.paymentLinkSentAt });
  } catch (error) {
    console.error("Send payment link error:", error);
    return NextResponse.json({ error: "Failed to send payment link" }, { status: 500 });
  }
}
