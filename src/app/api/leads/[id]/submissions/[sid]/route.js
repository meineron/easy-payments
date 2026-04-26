import { NextResponse } from "next/server";
import { getClubContext, dualSave, dualWrite } from "@/lib/club-context";
import { writeLeadLog, getSessionAuthor } from "@/lib/lead-logs";

export async function GET(request, { params }) {
  try {
    const { ctx, error } = await getClubContext();
    if (error) return NextResponse.json(error.body, { status: error.status });
    const { Lead, LeadSubmission } = ctx.models;

    const { id, sid } = await params;

    const lead = await Lead.findOne({ _id: id, clubId: ctx.clubId }).select("_id").lean();
    if (!lead) {
      return NextResponse.json({ error: "Lead not found" }, { status: 404 });
    }

    const submission = await LeadSubmission.findOne({ _id: sid, leadId: id, clubId: ctx.clubId }).lean();
    if (!submission) {
      return NextResponse.json({ error: "Submission not found" }, { status: 404 });
    }

    return NextResponse.json({ submission });
  } catch (error) {
    console.error("Get submission error:", error);
    return NextResponse.json({ error: "Failed to get submission" }, { status: 500 });
  }
}

const ALLOWED_STATUSES = ["in_progress", "done", "not_relevant"];

export async function PATCH(request, { params }) {
  try {
    const { session, ctx, error } = await getClubContext();
    if (error) return NextResponse.json(error.body, { status: error.status });
    const { Lead, LeadSubmission } = ctx.models;

    const { id, sid } = await params;
    const body = await request.json();

    const lead = await Lead.findOne({ _id: id, clubId: ctx.clubId }).select("_id").lean();
    if (!lead) {
      return NextResponse.json({ error: "Lead not found" }, { status: 404 });
    }

    const submission = await LeadSubmission.findOne({
      _id: sid,
      leadId: id,
      clubId: ctx.clubId,
    });
    if (!submission) {
      return NextResponse.json({ error: "Submission not found" }, { status: 404 });
    }

    if (body.status !== undefined) {
      if (!ALLOWED_STATUSES.includes(body.status)) {
        return NextResponse.json({ error: "Invalid status" }, { status: 400 });
      }

      const previous = submission.status;
      if (previous !== body.status) {
        submission.status = body.status;
        await dualSave(ctx, submission);

        const author = getSessionAuthor(session);
        await writeLeadLog({
          leadId: id,
          submissionId: sid,
          clubId: ctx.clubId,
          type: "submission_status_changed",
          ...author,
          content: `Status changed from ${previous} to ${body.status}`,
          context: { previous, next: body.status },
          ctx,
        });
      }
    }

    return NextResponse.json({ submission: submission.toObject() });
  } catch (error) {
    console.error("Patch submission error:", error);
    return NextResponse.json({ error: "Failed to update submission" }, { status: 500 });
  }
}

export async function DELETE(request, { params }) {
  try {
    const { session, ctx, error } = await getClubContext();
    if (error) return NextResponse.json(error.body, { status: error.status });
    const { Lead, LeadSubmission } = ctx.models;

    const { id, sid } = await params;

    const lead = await Lead.findOne({ _id: id, clubId: ctx.clubId }).select("_id").lean();
    if (!lead) {
      return NextResponse.json({ error: "Lead not found" }, { status: 404 });
    }

    const submission = await LeadSubmission.findOne({
      _id: sid,
      leadId: id,
      clubId: ctx.clubId,
    }).lean();
    if (!submission) {
      return NextResponse.json({ error: "Submission not found" }, { status: 404 });
    }

    await dualWrite(ctx, (M) => M.LeadSubmission.deleteOne({ _id: sid, leadId: id, clubId: ctx.clubId }));

    const author = getSessionAuthor(session);
    await writeLeadLog({
      leadId: id,
      submissionId: null,
      clubId: ctx.clubId,
      type: "submission_deleted",
      ...author,
      content: `Deleted submission from ${submission.name || submission.email || "Unknown"}`,
      context: {
        email: submission.email,
        phone: submission.phone,
        name: submission.name,
      },
      ctx,
    });

    await dualWrite(ctx, (M) => M.LeadLog.updateMany(
      { leadId: id, submissionId: sid },
      { $set: { submissionId: null } },
    ));

    return NextResponse.json({ message: "Submission deleted" });
  } catch (error) {
    console.error("Delete submission error:", error);
    return NextResponse.json({ error: "Failed to delete submission" }, { status: 500 });
  }
}
