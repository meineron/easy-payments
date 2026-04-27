import { getClubContext } from "@/lib/club-context";

async function _GET(req, res) {
  try {
    const { ctx, error } = await getClubContext(req, res);
    if (error) return res.status(200).json(error.body, { status: error.status });
    const { Lead, LeadLog } = ctx.models;

    const { id } = req.query;

    const lead = await Lead.findOne({ _id: id, clubId: ctx.clubId }).select("_id").lean();
    if (!lead) {
      return res.status(404).json({ error: "Lead not found" });
    }

    const { searchParams } = new URL(request.url);
    const type = searchParams.get("type");

    const filter = { leadId: id, clubId: ctx.clubId };
    if (type) filter.type = type;

    const logs = await LeadLog.find(filter).sort({ createdAt: -1 }).limit(500).lean();
    return res.status(200).json({ logs });
  } catch (error) {
    console.error("Get lead logs error:", error);
    return res.status(500).json({ error: "Failed to load logs" });
  }
}
export default async function handler(req, res) {
  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });
  return _GET(req, res);
}
