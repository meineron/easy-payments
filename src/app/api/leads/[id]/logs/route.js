import { NextResponse } from "next/server";
import { getClubContext } from "@/lib/club-context";

export async function GET(request, { params }) {
  try {
    const { ctx, error } = await getClubContext();
    if (error) return NextResponse.json(error.body, { status: error.status });
    const { Lead, LeadLog } = ctx.models;

    const { id } = await params;

    const lead = await Lead.findOne({ _id: id, clubId: ctx.clubId }).select("_id").lean();
    if (!lead) {
      return NextResponse.json({ error: "Lead not found" }, { status: 404 });
    }

    const { searchParams } = new URL(request.url);
    const type = searchParams.get("type");

    const filter = { leadId: id, clubId: ctx.clubId };
    if (type) filter.type = type;

    const logs = await LeadLog.find(filter).sort({ createdAt: -1 }).limit(500).lean();
    return NextResponse.json({ logs });
  } catch (error) {
    console.error("Get lead logs error:", error);
    return NextResponse.json({ error: "Failed to load logs" }, { status: 500 });
  }
}
