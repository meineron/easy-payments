import mongoose from "mongoose";
import { getClubContext, dualCreate } from "@/lib/club-context";
import { generateUniqueLeadSlug } from "@/lib/lead-slug";
import { defaultLeadFormSections } from "@/lib/lead-defaults";
import { recordPublicLookup } from "@/lib/public-lookup";

async function _GET(req, res) {
  try {
    const { ctx, error } = await getClubContext(req, res);
    if (error) return res.status(200).json(error.body, { status: error.status });
    const { Lead, LeadSubmission } = ctx.models;

    const leads = await Lead.find({ clubId: ctx.clubId })
      .select("title slug status expiresAt coverImage createdAt")
      .sort({ createdAt: -1 })
      .lean();

    const leadIds = leads.map((l) => l._id);
    const counts = leadIds.length
      ? await LeadSubmission.aggregate([
          { $match: { leadId: { $in: leadIds }, clubId: new mongoose.Types.ObjectId(ctx.clubId) } },
          { $group: { _id: "$leadId", count: { $sum: 1 } } },
        ]).catch(() => [])
      : [];

    const countMap = Object.fromEntries(counts.map((c) => [String(c._id), c.count]));
    const enriched = leads.map((l) => ({
      ...l,
      submissionCount: countMap[String(l._id)] || 0,
    }));

    return res.status(200).json({ leads: enriched });
  } catch (error) {
    console.error("List leads error:", error);
    return res.status(500).json({ error: "Failed to list leads" });
  }
}

async function _POST(req, res) {
  try {
    const { ctx, error } = await getClubContext(req, res);
    if (error) return res.status(200).json(error.body, { status: error.status });

    const body = req.body;
    const { title } = body;

    if (!title || !title.trim()) {
      return res.status(400).json({ error: "Title is required" });
    }

    const slug = await generateUniqueLeadSlug();

    const lead = await dualCreate(ctx, "Lead", {
      clubId: ctx.clubId,
      slug,
      title: title.trim(),
      description: body.description || "",
      coverImage: body.coverImage || "",
      expiresAt: body.expiresAt || null,
      status: "enabled",
      formSections: defaultLeadFormSections(),
      notifyStaffIds: [],
      notifyChannels: { email: true, sms: false },
    });

    await recordPublicLookup("leadSlug", slug, ctx.clubId);

    return res.status(201).json({ lead });
  } catch (error) {
    console.error("Create lead error:", error);
    return res.status(500).json({ error: "Failed to create lead" });
  }
}
export default async function handler(req, res) {
  if (req.method === "GET") {
    return _GET(req, res);
  } else if (req.method === "POST") {
    return _POST(req, res);
  } else {
    return res.status(405).json({ error: "Method not allowed" });
  }
}
