import LeadLog from "@/models/LeadLog";

/**
 * Write a log entry for a lead / submission.
 * Pass `ctx` (from `getClubContext`) to dual-write into the tenant database.
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
  ctx = null,
}) {
  try {
    const data = {
      leadId,
      submissionId,
      clubId,
      type,
      authorType,
      authorId,
      authorName,
      content,
      context,
    };
    if (ctx) {
      const { dualCreate } = await import("@/lib/club-context");
      return await dualCreate(ctx, "LeadLog", data);
    }
    return await LeadLog.create(data);
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
      authorId: session.user.userId || session.user.id || "",
      authorName: session.user.name || "Staff",
    };
  }
  return {
    authorType: "club",
    authorId: session.user.userId || session.user.id || "",
    authorName: session.user.name || "Club",
  };
}
