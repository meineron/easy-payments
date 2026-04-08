import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import dbConnect from "@/lib/mongodb";
import PaymentRequest from "@/models/PaymentRequest";

export async function PUT(request, { params }) {
  try {
    const session = await getServerSession(authOptions);
    if (!session || session.user.role !== "club") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const { id, orderId, requestId } = await params;
    const body = await request.json();
    await dbConnect();

    const pr = await PaymentRequest.findOne({
      _id: requestId, orderId, activityId: id, clubId: session.user.id,
    });
    if (!pr) {
      return NextResponse.json({ error: "Payment request not found" }, { status: 404 });
    }
    if (pr.status === "paid") {
      return NextResponse.json({ error: "Cannot edit a paid payment request" }, { status: 400 });
    }

    if (body.note !== undefined) pr.note = body.note;

    await pr.save();
    return NextResponse.json({ paymentRequest: pr.toObject() });
  } catch (error) {
    console.error("Update payment request error:", error);
    return NextResponse.json({ error: "Failed to update payment request" }, { status: 500 });
  }
}

export async function DELETE(request, { params }) {
  try {
    const session = await getServerSession(authOptions);
    if (!session || session.user.role !== "club") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const { id, orderId, requestId } = await params;
    await dbConnect();

    const pr = await PaymentRequest.findOne({
      _id: requestId, orderId, activityId: id, clubId: session.user.id,
    });
    if (!pr) {
      return NextResponse.json({ error: "Payment request not found" }, { status: 404 });
    }
    if (pr.status === "paid") {
      return NextResponse.json({ error: "Cannot remove a paid payment request" }, { status: 400 });
    }

    await PaymentRequest.deleteOne({ _id: requestId });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Delete payment request error:", error);
    return NextResponse.json({ error: "Failed to delete payment request" }, { status: 500 });
  }
}
