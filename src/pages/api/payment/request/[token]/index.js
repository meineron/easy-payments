import { connectMain } from "@/lib/mongodb";
import { resolvePublicContext } from "@/lib/club-context";
import Club from "@/models/Club";

async function _GET(req, res) {
  try {
    const { token } = req.query;

    const ctx = await resolvePublicContext("paymentToken", token);
    if (!ctx) {
      return res.status(404).json({ error: "Payment link not found or expired" });
    }
    const { PaymentRequest, Order, Activity } = ctx.models;

    const pr = await PaymentRequest.findOne({ paymentToken: token }).lean();
    if (!pr) {
      return res.status(404).json({ error: "Payment link not found or expired" });
    }
    if (pr.status === "paid") {
      return res.status(200).json({ error: "Already paid", paid: true }, { status: 400 });
    }

    await connectMain();
    const [order, activity, club] = await Promise.all([
      Order.findById(pr.orderId, "playerFirstName playerLastName totalCostCents paidCents subscriptionTitle").lean(),
      Activity.findById(pr.activityId, "title passStripeFeeToCustomer").lean(),
      Club.findById(pr.clubId, "name logoUrl language").lean(),
    ]);

    return res.status(200).json({
      paymentRequest: {
        _id: pr._id,
        items: pr.items,
        totalCents: pr.totalCents,
        note: pr.note,
        status: pr.status,
        allowedInstallments: pr.allowedInstallments || [1],
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
    return res.status(500).json({ error: "Failed to load payment request details" });
  }
}
export default async function handler(req, res) {
  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });
  return _GET(req, res);
}
