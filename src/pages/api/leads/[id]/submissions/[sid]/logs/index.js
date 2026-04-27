import { getClubContext } from "@/lib/club-context";
import { writeLeadLog, getSessionAuthor } from "@/lib/lead-logs";

async function _GET(req, res) {
  try {
    const { ctx, error } = await getClubContext(req, res);
    if (error) return res.status(200).json(error.body, { status: error.status });
    const { Lead, LeadLog } = ctx.models;

    const { id, sid } = req.query;

    const lead = await Lead.findOne({ _id: id, clubId: ctx.clubId }).select("_id").lean();
    if (!lead) {
      return res.status(404).json({ error: "Lead not found" });
    }

    const logs = await LeadLog.find({
      leadId: id,
      submissionId: sid,
      clubId: ctx.clubId,
    })
      .sort({ createdAt: -1 })
      .limit(500)
      .lean();

    return res.status(200).json({ logs });
  } catch (error) {
    console.error("Get submission logs error:", error);
    return res.status(500).json({ error: "Failed to load logs" });
  }
}

async function _POST(req, res) {
  try {
    const { session, ctx, error } = await getClubContext(req, res);
    if (error) return res.status(200).json(error.body, { status: error.status });
    const { Lead, LeadSubmission } = ctx.models;

    const { id, sid } = req.query;
    const body = req.body;
    const content = (body.content || "").trim();
    if (!content) {
      return res.status(400).json({ error: "Comment is required" });
    }

    const lead = await Lead.findOne({ _id: id, clubId: ctx.clubId }).select("_id").lean();
    if (!lead) {
      return res.status(404).json({ error: "Lead not found" });
    }
    const submission = await LeadSubmission.findOne({
      _id: sid,
      leadId: id,
      clubId: ctx.clubId,
    }).select("_id").lean();
    if (!submission) {
      return res.status(404).json({ error: "Submission not found" });
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

    return res.status(201).json({ log });
  } catch (error) {
    console.error("Post comment error:", error);
    return res.status(500).json({ error: "Failed to add comment" });
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
