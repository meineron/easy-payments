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

    const params = { limit, expand: ["data.default_price"] };
    if (starting_after) params.starting_after = starting_after;

    const products = await customerStripe.products.list(params);

    return res.status(200).json({
      products: products.data,
      has_more: products.has_more,
      total: products.data.length,
    });
  } catch (error) {
    console.error("Customer products error:", error.message);
    return res.status(500).json({ error: error.message });
  }
}
export default async function handler(req, res) {
  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });
  return _GET(req, res);
}
