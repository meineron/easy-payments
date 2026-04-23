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

    const submission = await LeadSubmission.findOne({ _id: sid, leadId: id, clubId: session.user.id }).lean();
    if (!submission) {
      return NextResponse.json({ error: "Submission not found" }, { status: 404 });
    }

    return NextResponse.json({ submission });
  } catch (error) {
    console.error("Get submission error:", error);
    return NextResponse.json({ error: "Failed to get submission" }, { status: 500 });
  }
}

export async function DELETE(request, { params }) {
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

    const submission = await LeadSubmission.findOneAndDelete({
      _id: sid,
      leadId: id,
      clubId: session.user.id,
    });
    if (!submission) {
      return NextResponse.json({ error: "Submission not found" }, { status: 404 });
    }

    const author = getSessionAuthor(session);
    await writeLeadLog({
      leadId: id,
      submissionId: null,
      clubId: session.user.id,
      type: "submission_deleted",
      ...author,
      content: `Deleted submission from ${submission.name || submission.email || "Unknown"}`,
      context: {
        email: submission.email,
        phone: submission.phone,
        name: submission.name,
      },
    });

    await LeadLog.updateMany(
      { leadId: id, submissionId: sid },
      { $set: { submissionId: null } },
    );

    return NextResponse.json({ message: "Submission deleted" });
  } catch (error) {
    console.error("Delete submission error:", error);
    return NextResponse.json({ error: "Failed to delete submission" }, { status: 500 });
  }
}
