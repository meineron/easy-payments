import LeadLog from "@/models/LeadLog";

/**
 * Write a log entry for a lead / submission.
 * @param {Object} params
 * @param {string} params.leadId
 * @param {string} [params.submissionId]
 * @param {string} params.clubId
 * @param {string} params.type - one of the LeadLog enum types
 * @param {"club"|"staff"|"system"} params.authorType
 * @param {string} [params.authorId]
 * @param {string} [params.authorName]
 * @param {string} [params.content]
 * @param {Object} [params.context]
 */
export async function writeLeadLog({
  leadId,
  submissionId = null,
  clubId,
  type,
  authorType,
  authorId = "",
  authorName = "",
  content = "",
  context = {},
}) {
  try {
    return await LeadLog.create({
      leadId,
      submissionId,
      clubId,
      type,
      authorType,
      authorId,
      authorName,
      content,
      context,
    });
  } catch (err) {
    console.error("writeLeadLog error:", err);
    return null;
  }
}

export function getSessionAuthor(session) {
  if (!session?.user) return { authorType: "system", authorId: "", authorName: "System" };
  if (session.user.role === "staff") {
    return {
      authorType: "staff",
      authorId: session.user.id || "",
      authorName: session.user.name || "Staff",
    };
  }
  return {
    authorType: "club",
    authorId: session.user.id || "",
    authorName: session.user.name || "Club",
  };
}
