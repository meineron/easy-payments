import { getClubContext, dualSave, dualWrite } from "@/lib/club-context";

async function _PUT(req, res) {
  try {
    const { ctx, error } = await getClubContext(req, res);
    if (error) return res.status(200).json(error.body, { status: error.status });
    const { PaymentRequest } = ctx.models;

    const { id, orderId, requestId } = req.query;
    const body = req.body;

    const pr = await PaymentRequest.findOne({
      _id: requestId, orderId, activityId: id, clubId: ctx.clubId,
    });
    if (!pr) {
      return res.status(404).json({ error: "Payment request not found" });
    }
    if (pr.status === "paid") {
      return res.status(400).json({ error: "Cannot edit a paid payment request" });
    }

    if (body.note !== undefined) pr.note = body.note;

    await dualSave(ctx, pr);
    return res.status(200).json({ paymentRequest: pr.toObject() });
  } catch (error) {
    console.error("Update payment request error:", error);
    return res.status(500).json({ error: "Failed to update payment request" });
  }
}

async function _DELETE(req, res) {
  try {
    const { ctx, error } = await getClubContext(req, res);
    if (error) return res.status(200).json(error.body, { status: error.status });
    const { PaymentRequest } = ctx.models;

    const { id, orderId, requestId } = req.query;

    const pr = await PaymentRequest.findOne({
      _id: requestId, orderId, activityId: id, clubId: ctx.clubId,
    });
    if (!pr) {
      return res.status(404).json({ error: "Payment request not found" });
    }
    if (pr.status === "paid") {
      return res.status(400).json({ error: "Cannot remove a paid payment request" });
    }

    await dualWrite(ctx, (M) => M.PaymentRequest.deleteOne({ _id: requestId }));
    return res.status(200).json({ success: true });
  } catch (error) {
    console.error("Delete payment request error:", error);
    return res.status(500).json({ error: "Failed to delete payment request" });
  }
}
export default async function handler(req, res) {
  if (req.method === "PUT") {
    return _PUT(req, res);
  } else if (req.method === "DELETE") {
    return _DELETE(req, res);
  } else {
    return res.status(405).json({ error: "Method not allowed" });
  }
}
