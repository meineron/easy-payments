import { NextResponse } from "next/server";
import { getClubContext } from "@/lib/club-context";

export async function GET(request, { params }) {
  try {
    const { ctx, error } = await getClubContext();
    if (error) return NextResponse.json(error.body, { status: error.status });
    const { Lead, LeadSubmission } = ctx.models;

    const { id } = await params;

    const lead = await Lead.findOne({ _id: id, clubId: ctx.clubId }).select("_id").lean();
    if (!lead) {
      return NextResponse.json({ error: "Lead not found" }, { status: 404 });
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

    return NextResponse.json({
      submissions,
      total,
      page,
      pages: Math.ceil(total / limit) || 1,
    });
  } catch (error) {
    console.error("List lead submissions error:", error);
    return NextResponse.json({ error: "Failed to list submissions" }, { status: 500 });
  }
}
