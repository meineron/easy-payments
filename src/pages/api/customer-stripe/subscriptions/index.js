import Stripe from "stripe";

async function _GET(req, res) {
  try {
    const key = process.env.CUSTOMER_STRIPE_SECRET_KEY;
    if (!key) {
      return res.status(500).json({ error: "CUSTOMER_STRIPE_SECRET_KEY not configured" });
    }

    const customerStripe = new Stripe(key);

    const { searchParams } = new URL(request.url);
    const limit = parseInt(searchParams.get("limit") || "25", 10);
    const starting_after = searchParams.get("starting_after") || undefined;

    const params = { limit, expand: ["data.customer"] };
    if (starting_after) params.starting_after = starting_after;

    const subscriptions = await customerStripe.subscriptions.list(params);

    return res.status(200).json({
      subscriptions: subscriptions.data,
      has_more: subscriptions.has_more,
      total: subscriptions.data.length,
    });
  } catch (error) {
    console.error("Customer subscriptions error:", error.message);
    return res.status(500).json({ error: error.message });
  }
}
export default async function handler(req, res) {
  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });
  return _GET(req, res);
}
