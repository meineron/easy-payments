import { NextResponse } from "next/server";
import { getClubContext, dualSave, dualWrite } from "@/lib/club-context";

export async function GET(request, { params }) {
  try {
    const { ctx, error } = await getClubContext();
    if (error) return NextResponse.json(error.body, { status: error.status });
    const { Activity } = ctx.models;

    const { id } = await params;

    const activity = await Activity.findOne({ _id: id, clubId: ctx.clubId })
      .populate("teams.teamId", "name season gender teamType year costCents");

    if (!activity) {
      return NextResponse.json({ error: "Activity not found" }, { status: 404 });
    }

    return NextResponse.json({ activity });
  } catch (error) {
    console.error("Get activity error:", error);
    return NextResponse.json({ error: "Failed to get activity" }, { status: 500 });
  }
}

export async function PUT(request, { params }) {
  try {
    const { ctx, error } = await getClubContext();
    if (error) return NextResponse.json(error.body, { status: error.status });
    const { Activity } = ctx.models;

    const { id } = await params;
    const body = await request.json();

    const activity = await Activity.findOne({ _id: id, clubId: ctx.clubId });
    if (!activity) {
      return NextResponse.json({ error: "Activity not found" }, { status: 404 });
    }

    const allowed = [
      "title", "coverImage", "description", "type", "season", "hasPayment",
      "startDate", "endDate", "lastRegisterDate",
      "status", "registrationType", "hiddenLink", "onlyAssignedPlayers", "playerAssignment",
      "teams", "formSections", "subscriptions", "coupons", "waivers",
      "waiverEmailConfirmation",
      "passStripeFeeToCustomer", "afterRegistrationMessage",
      "registrationInvitation",
    ];

    for (const key of allowed) {
      if (body[key] !== undefined) {
        activity[key] = body[key];
      }
    }

    await dualSave(ctx, activity);

    const populated = await Activity.findById(activity._id)
      .populate("teams.teamId", "name season gender teamType year costCents");

    return NextResponse.json({ activity: populated });
  } catch (error) {
    console.error("Update activity error:", error);
    return NextResponse.json({ error: "Failed to update activity" }, { status: 500 });
  }
}

export async function DELETE(request, { params }) {
  try {
    const { ctx, error } = await getClubContext();
    if (error) return NextResponse.json(error.body, { status: error.status });

    const { id } = await params;

    const result = await dualWrite(ctx, (M) => M.Activity.deleteOne({ _id: id, clubId: ctx.clubId }));
    if (result.deletedCount === 0) {
      return NextResponse.json({ error: "Activity not found" }, { status: 404 });
    }

    return NextResponse.json({ message: "Activity deleted" });
  } catch (error) {
    console.error("Delete activity error:", error);
    return NextResponse.json({ error: "Failed to delete activity" }, { status: 500 });
  }
}
