import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import dbConnect from "@/lib/mongodb";
import Lead from "@/models/Lead";
import LeadSubmission from "@/models/LeadSubmission";
import LeadLog from "@/models/LeadLog";
import { writeLeadLog, getSessionAuthor } from "@/lib/lead-logs";

export async function GET(request, { params }) {
  try {
    const session = await getServerSession(authOptions);
    if (!session || session.user.role !== "club") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id, sid } = await params;
    await dbConnect();

    const lead = await Lead.findOne({ _id: id, clubId: session.user.id }).select("_id").lean();
    if (!lead) {
      return NextResponse.json({ error: "Lead not found" }, { status: 404 });
    }

    const logs = await LeadLog.find({
      leadId: id,
      submissionId: sid,
      clubId: session.user.id,
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
    const session = await getServerSession(authOptions);
    if (!session || session.user.role !== "club") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id, sid } = await params;
    const body = await request.json();
    const content = (body.content || "").trim();
    if (!content) {
      return NextResponse.json({ error: "Comment is required" }, { status: 400 });
    }

    await dbConnect();

    const lead = await Lead.findOne({ _id: id, clubId: session.user.id }).select("_id").lean();
    if (!lead) {
      return NextResponse.json({ error: "Lead not found" }, { status: 404 });
    }
    const submission = await LeadSubmission.findOne({
      _id: sid,
      leadId: id,
      clubId: session.user.id,
    }).select("_id").lean();
    if (!submission) {
      return NextResponse.json({ error: "Submission not found" }, { status: 404 });
    }

    const author = getSessionAuthor(session);
    const log = await writeLeadLog({
      leadId: id,
      submissionId: sid,
      clubId: session.user.id,
      type: "comment",
      ...author,
      content,
      context: {},
    });

    return NextResponse.json({ log }, { status: 201 });
  } catch (error) {
    console.error("Post comment error:", error);
    return NextResponse.json({ error: "Failed to add comment" }, { status: 500 });
  }
}
