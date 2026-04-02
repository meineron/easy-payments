import { NextResponse } from "next/server";
import dbConnect from "@/lib/mongodb";
import Team from "@/models/Team";
import Club from "@/models/Club";

export async function GET(request, { params }) {
  try {
    const { id } = await params;
    await dbConnect();

    const team = await Team.findById(id);
    if (!team) {
      return NextResponse.json({ error: "Team not found" }, { status: 404 });
    }

    const club = await Club.findById(team.clubId).select("name");
    if (!club) {
      return NextResponse.json({ error: "Club not found" }, { status: 404 });
    }

    return NextResponse.json({
      team: {
        _id: team._id,
        name: team.name,
        season: team.season,
        gender: team.gender,
        teamType: team.teamType,
        costCents: team.costCents,
        loyaltyDiscountCents: team.loyaltyDiscountCents || 0,
        activityStartDate: team.activityStartDate,
      },
      clubName: club.name,
    });
  } catch (error) {
    console.error("Public team fetch error:", error);
    return NextResponse.json({ error: "Failed to load team" }, { status: 500 });
  }
}
