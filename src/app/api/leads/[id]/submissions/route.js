import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import dbConnect from "@/lib/mongodb";
import Lead from "@/models/Lead";
import LeadSubmission from "@/models/LeadSubmission";

export async function GET(request, { params }) {
  try {
    const session = await getServerSession(authOptions);
    if (!session || session.user.role !== "club") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;
    await dbConnect();

    const lead = await Lead.findOne({ _id: id, clubId: session.user.id }).select("_id").lean();
    if (!lead) {
      return NextResponse.json({ error: "Lead not found" }, { status: 404 });
    }

    const { searchParams } = new URL(request.url);
    const page = Math.max(1, parseInt(searchParams.get("page") || "1", 10));
    const limit = Math.min(100, Math.max(1, parseInt(searchParams.get("limit") || "50", 10)));
    const skip = (page - 1) * limit;

    const [submissions, total] = await Promise.all([
      LeadSubmission.find({ leadId: id, clubId: session.user.id })
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      LeadSubmission.countDocuments({ leadId: id, clubId: session.user.id }),
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
