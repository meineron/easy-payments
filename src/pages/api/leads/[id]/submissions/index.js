import { getClubContext } from "@/lib/club-context";

async function _GET(req, res) {
  try {
    const { ctx, error } = await getClubContext(req, res);
    if (error) return res.status(200).json(error.body, { status: error.status });
    const { Lead, LeadSubmission } = ctx.models;

    const { id } = req.query;

    const lead = await Lead.findOne({ _id: id, clubId: ctx.clubId }).select("_id").lean();
    if (!lead) {
      return res.status(404).json({ error: "Lead not found" });
    }

    const { searchParams } = new URL(request.url);
    const page = Math.max(1, parseInt(searchParams.get("page") || "1", 10));
    const limit = Math.min(100, Math.max(1, parseInt(searchParams.get("limit") || "50", 10)));
    const skip = (page - 1) * limit;

    const [submissions, total] = await Promise.all([
      LeadSubmission.find({ leadId: id, clubId: ctx.clubId })
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      LeadSubmission.countDocuments({ leadId: id, clubId: ctx.clubId }),
    ]);

    return res.status(200).json({
      submissions,
      total,
      page,
      pages: Math.ceil(total / limit) || 1,
    });
  } catch (error) {
    console.error("List lead submissions error:", error);
    return res.status(500).json({ error: "Failed to list submissions" });
  }
}
export default async function handler(req, res) {
  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });
  return _GET(req, res);
}
