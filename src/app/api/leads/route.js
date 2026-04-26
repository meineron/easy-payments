import { NextResponse } from "next/server";
import mongoose from "mongoose";
import { getClubContext, dualCreate } from "@/lib/club-context";
import { generateUniqueLeadSlug } from "@/lib/lead-slug";
import { defaultLeadFormSections } from "@/lib/lead-defaults";
import { recordPublicLookup } from "@/lib/public-lookup";

export async function GET() {
  try {
    const { ctx, error } = await getClubContext();
    if (error) return NextResponse.json(error.body, { status: error.status });
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

    return NextResponse.json({ leads: enriched });
  } catch (error) {
    console.error("List leads error:", error);
    return NextResponse.json({ error: "Failed to list leads" }, { status: 500 });
  }
}

export async function POST(request) {
  try {
    const { ctx, error } = await getClubContext();
    if (error) return NextResponse.json(error.body, { status: error.status });

    const body = await request.json();
    const { title } = body;

    if (!title || !title.trim()) {
      return NextResponse.json({ error: "Title is required" }, { status: 400 });
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

    return NextResponse.json({ lead }, { status: 201 });
  } catch (error) {
    console.error("Create lead error:", error);
    return NextResponse.json({ error: "Failed to create lead" }, { status: 500 });
  }
}
