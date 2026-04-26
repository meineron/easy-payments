import { NextResponse } from "next/server";
import { getClubContext, dualSave, dualWrite } from "@/lib/club-context";

export async function PUT(request, { params }) {
  try {
    const { ctx, error } = await getClubContext();
    if (error) return NextResponse.json(error.body, { status: error.status });
    const { PaymentRequest } = ctx.models;

    const { id, orderId, requestId } = await params;
    const body = await request.json();

    const pr = await PaymentRequest.findOne({
      _id: requestId, orderId, activityId: id, clubId: ctx.clubId,
    });
    if (!pr) {
      return NextResponse.json({ error: "Payment request not found" }, { status: 404 });
    }
    if (pr.status === "paid") {
      return NextResponse.json({ error: "Cannot edit a paid payment request" }, { status: 400 });
    }

    if (body.note !== undefined) pr.note = body.note;

    await dualSave(ctx, pr);
    return NextResponse.json({ paymentRequest: pr.toObject() });
  } catch (error) {
    console.error("Update payment request error:", error);
    return NextResponse.json({ error: "Failed to update payment request" }, { status: 500 });
  }
}

export async function DELETE(request, { params }) {
  try {
    const { ctx, error } = await getClubContext();
    if (error) return NextResponse.json(error.body, { status: error.status });
    const { PaymentRequest } = ctx.models;

    const { id, orderId, requestId } = await params;

    const pr = await PaymentRequest.findOne({
      _id: requestId, orderId, activityId: id, clubId: ctx.clubId,
    });
    if (!pr) {
      return NextResponse.json({ error: "Payment request not found" }, { status: 404 });
    }
    if (pr.status === "paid") {
      return NextResponse.json({ error: "Cannot remove a paid payment request" }, { status: 400 });
    }

    await dualWrite(ctx, (M) => M.PaymentRequest.deleteOne({ _id: requestId }));
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Delete payment request error:", error);
    return NextResponse.json({ error: "Failed to delete payment request" }, { status: 500 });
  }
}
