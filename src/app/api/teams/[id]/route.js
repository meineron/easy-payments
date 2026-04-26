import { NextResponse } from "next/server";
import { getClubContext, dualWrite } from "@/lib/club-context";

export async function GET(request, { params }) {
  try {
    const { ctx, error } = await getClubContext();
    if (error) return NextResponse.json(error.body, { status: error.status });

    const { id } = await params;
    const team = await ctx.models.Team.findOne({ _id: id, clubId: ctx.clubId });

    if (!team) {
      return NextResponse.json({ error: "Team not found" }, { status: 404 });
    }

    return NextResponse.json({ team });
  } catch (error) {
    console.error("Get team error:", error);
    return NextResponse.json({ error: "Failed to get team" }, { status: 500 });
  }
}

export async function PUT(request, { params }) {
  try {
    const { ctx, error } = await getClubContext();
    if (error) return NextResponse.json(error.body, { status: error.status });

    const { id } = await params;
    const { name, season, gender, teamType, costDollars, loyaltyDiscountDollars, activityStartDate } = await request.json();

    const updates = {};
    if (name) updates.name = name.trim();
    if (season) updates.season = season;
    if (teamType !== undefined) updates.teamType = teamType.trim();
    if (gender !== undefined) {
      if (gender && !["Male", "Female", ""].includes(gender)) {
        return NextResponse.json({ error: "Gender must be Male or Female" }, { status: 400 });
      }
      updates.gender = gender;
    }
    if (costDollars !== undefined) {
      const costCents = Math.round(parseFloat(costDollars) * 100);
      updates.costCents = Math.max(costCents, 0);
    }
    if (loyaltyDiscountDollars !== undefined) {
      updates.loyaltyDiscountCents = Math.max(Math.round(parseFloat(loyaltyDiscountDollars) * 100) || 0, 0);
    }
    if (activityStartDate) {
      const startDate = new Date(activityStartDate);
      if (isNaN(startDate.getTime())) {
        return NextResponse.json({ error: "Invalid activity start date" }, { status: 400 });
      }
      updates.activityStartDate = startDate;
    }

    const team = await dualWrite(ctx, (M) => M.Team.findOneAndUpdate(
      { _id: id, clubId: ctx.clubId },
      updates,
      { new: true },
    ));

    if (!team) {
      return NextResponse.json({ error: "Team not found" }, { status: 404 });
    }

    return NextResponse.json({ team });
  } catch (error) {
    console.error("Update team error:", error);
    return NextResponse.json({ error: "Failed to update team" }, { status: 500 });
  }
}

export async function DELETE(request, { params }) {
  try {
    const { ctx, error } = await getClubContext();
    if (error) return NextResponse.json(error.body, { status: error.status });

    const { id } = await params;
    const team = await dualWrite(ctx, (M) => M.Team.findOneAndDelete({ _id: id, clubId: ctx.clubId }));

    if (!team) {
      return NextResponse.json({ error: "Team not found" }, { status: 404 });
    }

    return NextResponse.json({ message: "Team deleted" });
  } catch (error) {
    console.error("Delete team error:", error);
    return NextResponse.json({ error: "Failed to delete team" }, { status: 500 });
  }
}
