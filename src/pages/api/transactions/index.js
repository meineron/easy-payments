import { getClubContext } from "@/lib/club-context";

async function _GET(req, res) {
  try {
    const { ctx, error } = await getClubContext(req, res);
    if (error) return res.status(200).json(error.body, { status: error.status });

    const transactions = await ctx.models.Transaction.find({ clubId: ctx.clubId })
      .sort({ createdAt: -1 })
      .lean();

    return res.status(200).json({ transactions });
  } catch (error) {
    console.error("Transactions fetch error:", error);
    return res.status(500).json({ error: "Failed to fetch transactions" });
  }
}
export default async function handler(req, res) {
  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });
  return _GET(req, res);
}
