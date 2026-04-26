import { NextResponse } from "next/server";
import { getClubContext, dualWrite } from "@/lib/club-context";

export async function GET(request, { params }) {
  try {
    const { ctx, error } = await getClubContext();
    if (error) return NextResponse.json(error.body, { status: error.status });
    const { Team, Player } = ctx.models;

    const { id } = await params;
    const team = await Team.findOne({ _id: id, clubId: ctx.clubId });
    if (!team) {
      return NextResponse.json({ error: "Team not found" }, { status: 404 });
    }

    const players = await Player.find({
      clubId: ctx.clubId,
      "teams.teamId": id,
    })
      .populate("parents", "firstName lastName email phonePrefix phone")
      .sort({ lastName: 1, firstName: 1 });

    return NextResponse.json({ players });
  } catch (error) {
    console.error("List team players error:", error);
    return NextResponse.json({ error: "Failed to list players" }, { status: 500 });
  }
}

export async function POST(request, { params }) {
  try {
    const { ctx, error } = await getClubContext();
    if (error) return NextResponse.json(error.body, { status: error.status });
    const { Team } = ctx.models;

    const { id } = await params;
    const body = await request.json();

    const team = await Team.findOne({ _id: id, clubId: ctx.clubId });
    if (!team) {
      return NextResponse.json({ error: "Team not found" }, { status: 404 });
    }

    const { playerIds } = body;
    if (!Array.isArray(playerIds) || playerIds.length === 0) {
      return NextResponse.json({ error: "playerIds array is required" }, { status: 400 });
    }

    const teamEntry = { teamId: id, season: team.season };

    const result = await dualWrite(ctx, (M) => M.Player.updateMany(
      {
        _id: { $in: playerIds },
        clubId: ctx.clubId,
        "teams.teamId": { $ne: id },
      },
      { $addToSet: { teams: teamEntry } },
    ));

    return NextResponse.json({
      added: result.modifiedCount,
      message: `${result.modifiedCount} player(s) added to ${team.name}`,
    });
  } catch (error) {
    console.error("Add players to team error:", error);
    return NextResponse.json({ error: "Failed to add players" }, { status: 500 });
  }
}

export async function DELETE(request, { params }) {
  try {
    const { ctx, error } = await getClubContext();
    if (error) return NextResponse.json(error.body, { status: error.status });
    const { Team } = ctx.models;

    const { id } = await params;
    const { playerId } = await request.json();

    if (!playerId) {
      return NextResponse.json({ error: "playerId is required" }, { status: 400 });
    }

    const team = await Team.findOne({ _id: id, clubId: ctx.clubId });
    if (!team) return NextResponse.json({ error: "Team not found" }, { status: 404 });

    const result = await dualWrite(ctx, (M) => M.Player.updateOne(
      { _id: playerId, clubId: ctx.clubId },
      { $pull: { teams: { teamId: id } } },
    ));

    if (result.modifiedCount === 0) {
      return NextResponse.json({ error: "Player not found in this team" }, { status: 404 });
    }

    return NextResponse.json({ message: `Player removed from ${team.name}` });
  } catch (error) {
    console.error("Remove player from team error:", error);
    return NextResponse.json({ error: "Failed to remove player" }, { status: 500 });
  }
}
