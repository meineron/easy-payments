import { NextResponse } from "next/server";
import { getClubContext } from "@/lib/club-context";
import { writeLeadLog, getSessionAuthor } from "@/lib/lead-logs";

export async function GET(request, { params }) {
  try {
    const { ctx, error } = await getClubContext();
    if (error) return NextResponse.json(error.body, { status: error.status });
    const { Lead, LeadLog } = ctx.models;

    const { id, sid } = await params;

    const lead = await Lead.findOne({ _id: id, clubId: ctx.clubId }).select("_id").lean();
    if (!lead) {
      return NextResponse.json({ error: "Lead not found" }, { status: 404 });
    }

    const logs = await LeadLog.find({
      leadId: id,
      submissionId: sid,
      clubId: ctx.clubId,
    })
      .sort({ createdAt: -1 })
      .limit(500)
      .lean();

    return NextResponse.json({ logs });
  } catch (error) {
    console.error("Get submission logs error:", error);
    return NextResponse.json({ error: "Failed to load logs" }, { status: 500 });
  }
}

export async function POST(request, { params }) {
  try {
    const { session, ctx, error } = await getClubContext();
    if (error) return NextResponse.json(error.body, { status: error.status });
    const { Lead, LeadSubmission } = ctx.models;

    const { id, sid } = await params;
    const body = await request.json();
    const content = (body.content || "").trim();
    if (!content) {
      return NextResponse.json({ error: "Comment is required" }, { status: 400 });
    }

    const lead = await Lead.findOne({ _id: id, clubId: ctx.clubId }).select("_id").lean();
    if (!lead) {
      return NextResponse.json({ error: "Lead not found" }, { status: 404 });
    }
    const submission = await LeadSubmission.findOne({
      _id: sid,
      leadId: id,
      clubId: ctx.clubId,
    }).select("_id").lean();
    if (!submission) {
      return NextResponse.json({ error: "Submission not found" }, { status: 404 });
    }

    const author = getSessionAuthor(session);
    const log = await writeLeadLog({
      leadId: id,
      submissionId: sid,
      clubId: ctx.clubId,
      type: "comment",
      ...author,
      content,
      context: {},
      ctx,
    });

    return NextResponse.json({ log }, { status: 201 });
  } catch (error) {
    console.error("Post comment error:", error);
    return NextResponse.json({ error: "Failed to add comment" }, { status: 500 });
  }
}
