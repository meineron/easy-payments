import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import dbConnect from "@/lib/mongodb";
import Player from "@/models/Player";
import Team from "@/models/Team";
import Registration from "@/models/Registration";

export async function GET(request, { params }) {
  try {
    const session = await getServerSession(authOptions);
    if (!session || session.user.role !== "club") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;
    await dbConnect();

    const player = await Player.findOne({ _id: id, clubId: session.user.id });
    if (!player) {
      return NextResponse.json({ error: "Player not found" }, { status: 404 });
    }

    const [allTeams, registrations] = await Promise.all([
      Team.find({ clubId: session.user.id }).sort({ season: -1, teamType: 1, name: 1 }),
      Registration.find({
        clubId: session.user.id,
        playerFirstName: { $regex: new RegExp(`^${escapeRegex(player.firstName)}$`, "i") },
        playerLastName: { $regex: new RegExp(`^${escapeRegex(player.lastName)}$`, "i") },
      }).select("teamId status"),
    ]);

    const registrationStatuses = {};
    for (const reg of registrations) {
      const tid = reg.teamId.toString();
      if (!registrationStatuses[tid] || reg.status === "active" || reg.status === "completed") {
        registrationStatuses[tid] = reg.status;
      }
    }

    const playerTeamIds = player.teams.map((t) => t.teamId.toString());
    const registrationTeamId = player.registrationTeamId ? player.registrationTeamId.toString() : null;

    return NextResponse.json({ allTeams, playerTeamIds, registrationTeamId, registrationStatuses });
  } catch (error) {
    console.error("Get player teams error:", error);
    return NextResponse.json({ error: "Failed to get player teams" }, { status: 500 });
  }
}

export async function PUT(request, { params }) {
  try {
    const session = await getServerSession(authOptions);
    if (!session || session.user.role !== "club") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;
    const { teamIds, registrationTeamId } = await request.json();
    await dbConnect();

    if (!Array.isArray(teamIds)) {
      return NextResponse.json({ error: "teamIds array is required" }, { status: 400 });
    }

    const player = await Player.findOne({ _id: id, clubId: session.user.id });
    if (!player) {
      return NextResponse.json({ error: "Player not found" }, { status: 404 });
    }

    const allIds = new Set(teamIds);
    if (registrationTeamId) allIds.add(registrationTeamId);

    const teams = await Team.find({ _id: { $in: [...allIds] }, clubId: session.user.id }).select("_id season");
    const teamMap = {};
    for (const t of teams) teamMap[t._id.toString()] = t.season;

    const newTeams = [...allIds]
      .filter((tid) => teamMap[tid])
      .map((tid) => ({ teamId: tid, season: teamMap[tid] }));

    player.teams = newTeams;
    player.registrationTeamId = registrationTeamId && teamMap[registrationTeamId] ? registrationTeamId : null;
    await player.save();

    return NextResponse.json({
      message: `Player updated: registration team set, ${newTeams.length} total team(s)`,
      teamCount: newTeams.length,
    });
  } catch (error) {
    console.error("Update player teams error:", error);
    return NextResponse.json({ error: "Failed to update teams" }, { status: 500 });
  }
}

function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
