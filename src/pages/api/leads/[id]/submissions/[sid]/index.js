import { getClubContext, dualSave, dualWrite } from "@/lib/club-context";
import { writeLeadLog, getSessionAuthor } from "@/lib/lead-logs";

async function _GET(req, res) {
  try {
    const { ctx, error } = await getClubContext(req, res);
    if (error) return res.status(200).json(error.body, { status: error.status });
    const { Lead, LeadSubmission } = ctx.models;

    const { id, sid } = req.query;

    const lead = await Lead.findOne({ _id: id, clubId: ctx.clubId }).select("_id").lean();
    if (!lead) {
      return res.status(404).json({ error: "Lead not found" });
    }

    const submission = await LeadSubmission.findOne({ _id: sid, leadId: id, clubId: ctx.clubId }).lean();
    if (!submission) {
      return res.status(404).json({ error: "Submission not found" });
    }

    return res.status(200).json({ submission });
  } catch (error) {
    console.error("Get submission error:", error);
    return res.status(500).json({ error: "Failed to get submission" });
  }
}

const ALLOWED_STATUSES = ["in_progress", "done", "not_relevant"];

async function _PATCH(req, res) {
  try {
    const { session, ctx, error } = await getClubContext(req, res);
    if (error) return res.status(200).json(error.body, { status: error.status });
    const { Lead, LeadSubmission } = ctx.models;

    const { id, sid } = req.query;
    const body = req.body;

    const lead = await Lead.findOne({ _id: id, clubId: ctx.clubId }).select("_id").lean();
    if (!lead) {
      return res.status(404).json({ error: "Lead not found" });
    }

    const submission = await LeadSubmission.findOne({
      _id: sid,
      leadId: id,
      clubId: ctx.clubId,
    });
    if (!submission) {
      return res.status(404).json({ error: "Submission not found" });
    }

    if (body.status !== undefined) {
      if (!ALLOWED_STATUSES.includes(body.status)) {
        return res.status(400).json({ error: "Invalid status" });
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

    return res.status(200).json({ submission: submission.toObject() });
  } catch (error) {
    console.error("Patch submission error:", error);
    return res.status(500).json({ error: "Failed to update submission" });
  }
}

async function _DELETE(req, res) {
  try {
    const { session, ctx, error } = await getClubContext(req, res);
    if (error) return res.status(200).json(error.body, { status: error.status });
    const { Lead, LeadSubmission } = ctx.models;

    const { id, sid } = req.query;

    const lead = await Lead.findOne({ _id: id, clubId: ctx.clubId }).select("_id").lean();
    if (!lead) {
      return res.status(404).json({ error: "Lead not found" });
    }

    const submission = await LeadSubmission.findOne({
      _id: sid,
      leadId: id,
      clubId: ctx.clubId,
    }).lean();
    if (!submission) {
      return res.status(404).json({ error: "Submission not found" });
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

    return res.status(200).json({ message: "Submission deleted" });
  } catch (error) {
    console.error("Delete submission error:", error);
    return res.status(500).json({ error: "Failed to delete submission" });
  }
}
export default async function handler(req, res) {
  if (req.method === "GET") {
    return _GET(req, res);
  } else if (req.method === "PATCH") {
    return _PATCH(req, res);
  } else if (req.method === "DELETE") {
    return _DELETE(req, res);
  } else {
    return res.status(405).json({ error: "Method not allowed" });
  }
}
