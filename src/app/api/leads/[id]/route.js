import { NextResponse } from "next/server";
import { getClubContext, dualSave, dualWrite } from "@/lib/club-context";
import { ensureMustFields } from "@/lib/lead-defaults";
import { writeLeadLog, getSessionAuthor } from "@/lib/lead-logs";

export async function GET(request, { params }) {
  try {
    const { ctx, error } = await getClubContext();
    if (error) return NextResponse.json(error.body, { status: error.status });
    const { Lead } = ctx.models;

    const { id } = await params;

    const lead = await Lead.findOne({ _id: id, clubId: ctx.clubId })
      .populate("notifyStaffIds", "firstName lastName email phone phonePrefix status");

    if (!lead) {
      return NextResponse.json({ error: "Lead not found" }, { status: 404 });
    }

    return NextResponse.json({ lead });
  } catch (error) {
    console.error("Get lead error:", error);
    return NextResponse.json({ error: "Failed to get lead" }, { status: 500 });
  }
}

export async function PUT(request, { params }) {
  try {
    const { session, ctx, error } = await getClubContext();
    if (error) return NextResponse.json(error.body, { status: error.status });
    const { Lead } = ctx.models;

    const { id } = await params;
    const body = await request.json();

    const lead = await Lead.findOne({ _id: id, clubId: ctx.clubId });
    if (!lead) {
      return NextResponse.json({ error: "Lead not found" }, { status: 404 });
    }

    const allowed = [
      "title", "description", "coverImage", "expiresAt",
      "status", "formSections", "notifyStaffIds", "notifyChannels",
    ];

    const author = getSessionAuthor(session);
    const diffs = [];
    const prevStatus = lead.status;

    for (const key of allowed) {
      if (body[key] === undefined) continue;
      if (key === "formSections") {
        lead.formSections = ensureMustFields(body.formSections);
        diffs.push({ field: "formSections" });
        continue;
      }
      const prev = lead[key];
      const next = body[key];
      if (JSON.stringify(prev) !== JSON.stringify(next)) {
        diffs.push({ field: key });
      }
      lead[key] = next;
    }

    await dualSave(ctx, lead);

    if (body.status && body.status !== prevStatus) {
      await writeLeadLog({
        leadId: lead._id,
        clubId: ctx.clubId,
        type: "status_changed",
        ...author,
        content: `Status changed from ${prevStatus} to ${body.status}`,
        context: { previous: prevStatus, next: body.status },
        ctx,
      });
    }

    if (diffs.length > 0) {
      const nonStatusDiffs = diffs.filter((d) => d.field !== "status");
      if (nonStatusDiffs.length > 0) {
        await writeLeadLog({
          leadId: lead._id,
          clubId: ctx.clubId,
          type: "lead_updated",
          ...author,
          content: `Updated fields: ${nonStatusDiffs.map((d) => d.field).join(", ")}`,
          context: { fields: nonStatusDiffs.map((d) => d.field) },
          ctx,
        });
      }
    }

    const populated = await Lead.findById(lead._id)
      .populate("notifyStaffIds", "firstName lastName email phone phonePrefix status");

    return NextResponse.json({ lead: populated });
  } catch (error) {
    console.error("Update lead error:", error);
    return NextResponse.json({ error: "Failed to update lead" }, { status: 500 });
  }
}

export async function DELETE(request, { params }) {
  try {
    const { ctx, error } = await getClubContext();
    if (error) return NextResponse.json(error.body, { status: error.status });
    const { Lead } = ctx.models;

    const { id } = await params;

    const lead = await Lead.findOne({ _id: id, clubId: ctx.clubId });
    if (!lead) {
      return NextResponse.json({ error: "Lead not found" }, { status: 404 });
    }

    await dualWrite(ctx, (M) => M.Lead.deleteOne({ _id: id, clubId: ctx.clubId }));
    await Promise.all([
      dualWrite(ctx, (M) => M.LeadSubmission.deleteMany({ leadId: id, clubId: ctx.clubId })),
      dualWrite(ctx, (M) => M.LeadLog.deleteMany({ leadId: id, clubId: ctx.clubId })),
    ]);

    return NextResponse.json({ message: "Lead deleted" });
  } catch (error) {
    console.error("Delete lead error:", error);
    return NextResponse.json({ error: "Failed to delete lead" }, { status: 500 });
  }
}
