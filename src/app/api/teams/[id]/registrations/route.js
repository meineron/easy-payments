import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import dbConnect from "@/lib/mongodb";
import Team from "@/models/Team";
import Registration from "@/models/Registration";
import Player from "@/models/Player";
import Parent from "@/models/Parent";

export async function GET(request, { params }) {
  try {
    const session = await getServerSession(authOptions);
    if (!session || session.user.role !== "club") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;
    await dbConnect();

    const team = await Team.findOne({ _id: id, clubId: session.user.id });
    if (!team) {
      return NextResponse.json({ error: "Team not found" }, { status: 404 });
    }

    const [registrations, teamPlayersRaw] = await Promise.all([
      Registration.find({ teamId: id }).sort({ createdAt: -1 }),
      Player.find({ clubId: session.user.id, "teams.teamId": id })
        .populate("registrationTeamId", "name season gender teamType")
        .populate("teams.teamId", "name season gender teamType")
        .populate("parents", "firstName lastName email phonePrefix phone")
        .sort({ lastName: 1, firstName: 1 }),
    ]);

    for (const p of teamPlayersRaw) {
      if (!p.registrationTeamId && p.teams.length > 0) {
        p.registrationTeamId = p.teams[0].teamId;
        await p.save();
      }
    }

    return NextResponse.json({ registrations, teamPlayers: teamPlayersRaw });
  } catch (error) {
    console.error("List registrations error:", error);
    return NextResponse.json({ error: "Failed to list registrations" }, { status: 500 });
  }
}
