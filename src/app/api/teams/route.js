import { NextResponse } from "next/server";
import { getClubContext, dualInsertMany } from "@/lib/club-context";

export async function GET() {
  try {
    const { ctx, error } = await getClubContext();
    if (error) return NextResponse.json(error.body, { status: error.status });

    const teams = await ctx.models.Team.find({ clubId: ctx.clubId }).sort({ teamType: 1, name: 1 });

    return NextResponse.json({ teams });
  } catch (error) {
    console.error("List teams error:", error);
    return NextResponse.json({ error: "Failed to list teams" }, { status: 500 });
  }
}

export async function POST(request) {
  try {
    const { ctx, error } = await getClubContext();
    if (error) return NextResponse.json(error.body, { status: error.status });

    const body = await request.json();
    const items = Array.isArray(body.teams) ? body.teams : [body];

    if (items.length === 0) {
      return NextResponse.json({ error: "At least one team is required" }, { status: 400 });
    }

    const docs = [];
    for (let i = 0; i < items.length; i++) {
      const { name, season, gender, teamType, costDollars, loyaltyDiscountDollars, activityStartDate } = items[i];

      if (!name || !season) {
        return NextResponse.json({ error: `Team ${i + 1}: Name and season are required` }, { status: 400 });
      }

      if (gender && !["Male", "Female", ""].includes(gender)) {
        return NextResponse.json({ error: `Team ${i + 1}: Gender must be Male or Female` }, { status: 400 });
      }

      const costCents = costDollars ? Math.round(parseFloat(costDollars) * 100) : 0;
      const loyaltyDiscountCents = loyaltyDiscountDollars ? Math.round(parseFloat(loyaltyDiscountDollars) * 100) : 0;
      const startDate = activityStartDate ? new Date(activityStartDate) : null;

      if (activityStartDate && (!startDate || isNaN(startDate.getTime()))) {
        return NextResponse.json({ error: `Team ${i + 1}: Invalid activity start date` }, { status: 400 });
      }

      docs.push({
        clubId: ctx.clubId,
        name: name.trim(),
        season,
        gender: gender || "",
        teamType: teamType ? teamType.trim() : "",
        costCents,
        loyaltyDiscountCents: Math.max(loyaltyDiscountCents, 0),
        activityStartDate: startDate,
      });
    }

    const teams = await dualInsertMany(ctx, "Team", docs);

    return NextResponse.json({ teams }, { status: 201 });
  } catch (error) {
    console.error("Create team error:", error);
    return NextResponse.json({ error: "Failed to create teams" }, { status: 500 });
  }
}
