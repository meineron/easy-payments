import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import dbConnect from "@/lib/mongodb";
import mongoose from "mongoose";
import crypto from "crypto";
import Order from "@/models/Order";
import Activity from "@/models/Activity";
import Club from "@/models/Club";
import { sendCustomPaymentEmail } from "@/lib/email";

function formatCents(c) { return "$" + ((c || 0) / 100).toFixed(2); }

function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

export async function POST(request, { params }) {
  try {
    const session = await getServerSession(authOptions);
    if (!session || session.user.role !== "club") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const { id } = await params;
    const body = await request.json();
    const { teamIds, subject, bodyHtml } = body;

    if (!subject?.trim() || !bodyHtml?.trim()) {
      return NextResponse.json({ error: "Subject and message are required" }, { status: 400 });
    }
    if (!teamIds?.length) {
      return NextResponse.json({ error: "Select at least one team" }, { status: 400 });
    }

    await dbConnect();

    const [activity, club] = await Promise.all([
      Activity.findById(id, "title").lean(),
      Club.findById(session.user.id, "name logoUrl").lean(),
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
      status: { $ne: "paid" },
      parent1Email: { $exists: true, $ne: "" },
    };
    const orders = await Order.find(filter);

    if (orders.length === 0) {
      console.log("Bulk email: no orders matched. Filter:", JSON.stringify(filter));
      return NextResponse.json({ error: "No unpaid orders with parent emails found for selected teams" }, { status: 404 });
    }
    console.log(`Bulk email: found ${orders.length} matching orders`);

    const baseUrl = process.env.NEXTAUTH_URL || "http://localhost:3000";
    const TEST_MODE = true;
    const TEST_EMAIL = "shlomi@easycoach.club";

    let sentCount = 0;
    let errorCount = 0;

    for (const order of orders) {
      if (TEST_MODE && sentCount >= 1) break;

      try {
        if (!order.paymentToken) {
          order.paymentToken = crypto.randomUUID();
        }
        order.paymentLinkSentAt = new Date();
        await order.save();

        const paymentUrl = `${baseUrl}/payment/${order.paymentToken}`;
        const recipient = TEST_MODE ? TEST_EMAIL : order.parent1Email;
        const totalDue = order.totalCostCents - (order.paidCents || 0);

        await sendCustomPaymentEmail(recipient, {
          subject,
          bodyHtml,
          playerName: `${order.playerFirstName} ${order.playerLastName}`,
          clubName: club.name || "",
          activityTitle: activity.title || "",
          paymentUrl,
          totalAmount: formatCents(totalDue > 0 ? totalDue : order.totalCostCents),
          logoUrl: club.logoUrl || null,
        });

        sentCount++;

        if (!TEST_MODE && sentCount % 5 === 0) await sleep(500);
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
