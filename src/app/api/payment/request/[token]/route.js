import { NextResponse } from "next/server";
import dbConnect from "@/lib/mongodb";
import PaymentRequest from "@/models/PaymentRequest";
import Order from "@/models/Order";
import Activity from "@/models/Activity";
import Club from "@/models/Club";

export async function GET(request, { params }) {
  try {
    const { token } = await params;
    await dbConnect();

    const pr = await PaymentRequest.findOne({ paymentToken: token }).lean();
    if (!pr) {
      return NextResponse.json({ error: "Payment link not found or expired" }, { status: 404 });
    }
    if (pr.status === "paid") {
      return NextResponse.json({ error: "Already paid", paid: true }, { status: 400 });
    }

    const [order, activity, club] = await Promise.all([
      Order.findById(pr.orderId, "playerFirstName playerLastName totalCostCents paidCents subscriptionTitle").lean(),
      Activity.findById(pr.activityId, "title passStripeFeeToCustomer").lean(),
      Club.findById(pr.clubId, "name logoUrl language").lean(),
    ]);

    return NextResponse.json({
      paymentRequest: {
        _id: pr._id,
        items: pr.items,
        totalCents: pr.totalCents,
        note: pr.note,
        status: pr.status,
      },
      order: {
        playerFirstName: order?.playerFirstName || "",
        playerLastName: order?.playerLastName || "",
        totalCostCents: order?.totalCostCents || 0,
        paidCents: order?.paidCents || 0,
        subscriptionTitle: order?.subscriptionTitle || "",
      },
      activity: {
        title: activity?.title || "",
      },
      club: {
        name: club?.name || "",
        logoUrl: club?.logoUrl || null,
        language: club?.language || "en",
        passStripeFeeToCustomer: !!activity?.passStripeFeeToCustomer,
      },
    });
  } catch (error) {
    console.error("Get payment request details error:", error);
    return NextResponse.json({ error: "Failed to load payment request details" }, { status: 500 });
  }
}
