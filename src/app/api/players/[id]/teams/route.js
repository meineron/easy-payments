import { NextResponse } from "next/server";
import { getClubContext, dualSave } from "@/lib/club-context";

export async function GET(request, { params }) {
  try {
    const { ctx, error } = await getClubContext();
    if (error) return NextResponse.json(error.body, { status: error.status });
    const { Player, Team, Registration } = ctx.models;

    const { id } = await params;

    const player = await Player.findOne({ _id: id, clubId: ctx.clubId });
    if (!player) {
      return NextResponse.json({ error: "Player not found" }, { status: 404 });
    }

    const [allTeams, registrations] = await Promise.all([
      Team.find({ clubId: ctx.clubId }).sort({ season: -1, teamType: 1, name: 1 }),
      Registration.find({
        clubId: ctx.clubId,
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
    const { ctx, error } = await getClubContext();
    if (error) return NextResponse.json(error.body, { status: error.status });
    const { Player, Team } = ctx.models;

    const { id } = await params;
    const { teamIds, registrationTeamId } = await request.json();

    if (!Array.isArray(teamIds)) {
      return NextResponse.json({ error: "teamIds array is required" }, { status: 400 });
    }

    const player = await Player.findOne({ _id: id, clubId: ctx.clubId });
    if (!player) {
      return NextResponse.json({ error: "Player not found" }, { status: 404 });
    }

    const allIds = new Set(teamIds);
    if (registrationTeamId) allIds.add(registrationTeamId);

    const teams = await Team.find({ _id: { $in: [...allIds] }, clubId: ctx.clubId }).select("_id season");
    const teamMap = {};
    for (const t of teams) teamMap[t._id.toString()] = t.season;

    const newTeams = [...allIds]
      .filter((tid) => teamMap[tid])
      .map((tid) => ({ teamId: tid, season: teamMap[tid] }));

    player.teams = newTeams;
    player.registrationTeamId = registrationTeamId && teamMap[registrationTeamId] ? registrationTeamId : null;
    await dualSave(ctx, player);

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
