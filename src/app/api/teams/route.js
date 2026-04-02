import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import dbConnect from "@/lib/mongodb";
import Team from "@/models/Team";

export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session || session.user.role !== "club") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    await dbConnect();
    const teams = await Team.find({ clubId: session.user.id }).sort({ teamType: 1, name: 1 });

    return NextResponse.json({ teams });
  } catch (error) {
    console.error("List teams error:", error);
    return NextResponse.json({ error: "Failed to list teams" }, { status: 500 });
  }
}

export async function POST(request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session || session.user.role !== "club") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

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
        clubId: session.user.id,
        name: name.trim(),
        season,
        gender: gender || "",
        teamType: teamType ? teamType.trim() : "",
        costCents,
        loyaltyDiscountCents: Math.max(loyaltyDiscountCents, 0),
        activityStartDate: startDate,
      });
    }

    await dbConnect();
    const teams = await Team.insertMany(docs);

    return NextResponse.json({ teams }, { status: 201 });
  } catch (error) {
    console.error("Create team error:", error);
    return NextResponse.json({ error: "Failed to create teams" }, { status: 500 });
  }
}
