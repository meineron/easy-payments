import { NextResponse } from "next/server";
import { getClubContext, dualSave } from "@/lib/club-context";

export async function GET(request, { params }) {
  try {
    const { ctx, error } = await getClubContext();
    if (error) return NextResponse.json(error.body, { status: error.status });
    const { Team, Registration, Player, Parent } = ctx.models;
    void Parent;

    const { id } = await params;
    const team = await Team.findOne({ _id: id, clubId: ctx.clubId });
    if (!team) {
      return NextResponse.json({ error: "Team not found" }, { status: 404 });
    }

    const [registrations, teamPlayersRaw] = await Promise.all([
      Registration.find({ teamId: id }).sort({ createdAt: -1 }),
      Player.find({ clubId: ctx.clubId, "teams.teamId": id })
        .populate("registrationTeamId", "name season gender teamType")
        .populate("teams.teamId", "name season gender teamType")
        .populate("parents", "firstName lastName email phonePrefix phone")
        .sort({ lastName: 1, firstName: 1 }),
    ]);

    for (const p of teamPlayersRaw) {
      if (!p.registrationTeamId && p.teams.length > 0) {
        p.registrationTeamId = p.teams[0].teamId;
        await dualSave(ctx, p);
      }
    }

    return NextResponse.json({ registrations, teamPlayers: teamPlayersRaw });
  } catch (error) {
    console.error("List registrations error:", error);
    return NextResponse.json({ error: "Failed to list registrations" }, { status: 500 });
  }
}
