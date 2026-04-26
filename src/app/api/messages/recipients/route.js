import { NextResponse } from "next/server";
import { getClubContext } from "@/lib/club-context";

export async function GET() {
  try {
    const { ctx, error } = await getClubContext();
    if (error) return NextResponse.json(error.body, { status: error.status });
    const { Player, Parent, Team } = ctx.models;

    const [players, parents, teams] = await Promise.all([
      Player.find({ clubId: ctx.clubId }, "firstName lastName email phonePrefix phoneNumber teams parents")
        .populate("teams.teamId", "name season")
        .populate("parents", "firstName lastName email phonePrefix phone")
        .sort("lastName firstName")
        .lean(),
      Parent.find({ clubId: ctx.clubId }, "firstName lastName email phonePrefix phone")
        .sort("lastName firstName")
        .lean(),
      Team.find({ clubId: ctx.clubId }, "name season")
        .sort("name")
        .lean(),
    ]);

    return NextResponse.json({ players, parents, teams });
  } catch (error) {
    console.error("Get recipients error:", error);
    return NextResponse.json({ error: "Failed to load recipients" }, { status: 500 });
  }
}
