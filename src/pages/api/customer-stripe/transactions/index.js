import { getClubStripe } from "@/lib/get-club-stripe";

async function _GET(req, res) {
  try {
    const { searchParams } = new URL(request.url);
    const clubId = searchParams.get("clubId") || undefined;
    const customerStripe = await getClubStripe(clubId);
    if (!customerStripe) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const limit = parseInt(searchParams.get("limit") || "50", 10);
    const starting_after = searchParams.get("starting_after") || undefined;

    const params = {
      limit,
      expand: ["data.customer", "data.invoice", "data.payment_intent"],
    };
    if (starting_after) params.starting_after = starting_after;

    const charges = await customerStripe.charges.list(params);

    const transactions = charges.data.map((charge) => {
      const card = charge.payment_method_details?.card;
      const customer = typeof charge.customer === "object" ? charge.customer : null;
      const invoice = typeof charge.invoice === "object" ? charge.invoice : null;
      const pi = typeof charge.payment_intent === "object" ? charge.payment_intent : null;

      const refunds = charge.refunds?.data || [];
      const latestRefund = refunds.length > 0 ? refunds[0] : null;

      const events = [];

      if (pi) {
        events.push({ type: "payment_intent.created", date: pi.created, detail: `PaymentIntent ${pi.id} created` });
      }
      events.push({ type: "charge.created", date: charge.created, detail: `Charge ${charge.id} for ${(charge.amount / 100).toFixed(2)} ${charge.currency.toUpperCase()}` });

      if (charge.status === "succeeded") {
        events.push({ type: "charge.succeeded", date: charge.created, detail: "Payment succeeded" });
      } else if (charge.status === "failed") {
        events.push({ type: "charge.failed", date: charge.created, detail: `Payment failed: ${charge.failure_message || "Unknown reason"}` });
      }

      if (pi && pi.status === "succeeded" && pi.latest_charge) {
        events.push({ type: "payment_intent.succeeded", date: charge.created, detail: `PaymentIntent ${pi.id} succeeded` });
      }

      if (charge.refunded || refunds.length > 0) {
        refunds.forEach((r) => {
          events.push({ type: "refund.created", date: r.created, detail: `Refund of ${(r.amount / 100).toFixed(2)} ${r.currency.toUpperCase()} — ${r.reason || "No reason"}` });
        });
      }

      if (charge.disputed) {
        events.push({ type: "charge.dispute.created", date: charge.created, detail: "Dispute created" });
      }

      events.sort((a, b) => a.date - b.date);

      return {
        id: charge.id,
        paymentIntentId: pi?.id || charge.payment_intent || null,
        amount: charge.amount,
        currency: charge.currency,
        status: charge.status,
        description: charge.description || pi?.description || null,
        created: charge.created,

        customerName: charge.billing_details?.name || customer?.name || null,
        customerEmail: charge.billing_details?.email || customer?.email || null,

        card: card ? {
          brand: card.brand,
          last4: card.last4,
          expMonth: card.exp_month,
          expYear: card.exp_year,
        } : null,
        paymentMethodType: charge.payment_method_details?.type || null,

        refunded: charge.refunded,
        amountRefunded: charge.amount_refunded,
        refundDate: latestRefund?.created || null,

        failureMessage: charge.failure_message || null,
        failureCode: charge.failure_code || null,

        paymentMethodId: charge.payment_method || null,

        receiptUrl: charge.receipt_url || null,
        invoiceUrl: invoice?.hosted_invoice_url || null,
        invoicePdf: invoice?.invoice_pdf || null,

        events,
      };
    });

    return res.status(200).json({
      transactions,
      has_more: charges.has_more,
      total: transactions.length,
    });
  } catch (error) {
    console.error("Customer transactions error:", error.message);
    return res.status(500).json({ error: error.message });
  }
}
export default async function handler(req, res) {
  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });
  return _GET(req, res);
}
