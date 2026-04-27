import { connectMain } from "@/lib/mongodb";
import { resolvePublicContext } from "@/lib/club-context";
import Club from "@/models/Club";

async function _GET(req, res) {
  try {
    const { slug } = req.query;

    const ctx = await resolvePublicContext("leadSlug", slug);
    if (!ctx) {
      return res.status(404).json({ error: "Not found" });
    }

    const lead = await ctx.models.Lead.findOne({ slug }).lean();
    if (!lead) {
      return res.status(404).json({ error: "Not found" });
    }

    if (lead.status !== "enabled") {
      return res.status(200).json({ error: "Unavailable", reason: "disabled" }, { status: 404 });
    }
    if (lead.expiresAt && new Date(lead.expiresAt) < new Date()) {
      return res.status(200).json({ error: "Expired", reason: "expired" }, { status: 404 });
    }

    await connectMain();
    const club = await Club.findById(lead.clubId).select("name logoUrl language").lean();

    const safeLead = {
      _id: lead._id,
      slug: lead.slug,
      title: lead.title,
      description: lead.description,
      coverImage: lead.coverImage,
      expiresAt: lead.expiresAt,
      formSections: lead.formSections,
    };

    return res.status(200).json({
      lead: safeLead,
      club: club ? { name: club.name, logoUrl: club.logoUrl, language: club.language || "en" } : null,
    });
  } catch (error) {
    console.error("Public get lead error:", error);
    return res.status(500).json({ error: "Failed to load lead" });
  }
}
export default async function handler(req, res) {
  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });
  return _GET(req, res);
}
