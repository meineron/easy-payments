import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import dbConnect from "@/lib/mongodb";
import Team from "@/models/Team";
import Player from "@/models/Player";

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

    const players = await Player.find({
      clubId: session.user.id,
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
    const session = await getServerSession(authOptions);
    if (!session || session.user.role !== "club") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;
    const body = await request.json();
    await dbConnect();

    const team = await Team.findOne({ _id: id, clubId: session.user.id });
    if (!team) {
      return NextResponse.json({ error: "Team not found" }, { status: 404 });
    }

    const { playerIds } = body;

    if (!Array.isArray(playerIds) || playerIds.length === 0) {
      return NextResponse.json({ error: "playerIds array is required" }, { status: 400 });
    }

    const teamEntry = { teamId: id, season: team.season };

    const result = await Player.updateMany(
      {
        _id: { $in: playerIds },
        clubId: session.user.id,
        "teams.teamId": { $ne: id },
      },
      { $addToSet: { teams: teamEntry } }
    );

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
    const session = await getServerSession(authOptions);
    if (!session || session.user.role !== "club") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;
    const { playerId } = await request.json();
    await dbConnect();

    if (!playerId) {
      return NextResponse.json({ error: "playerId is required" }, { status: 400 });
    }

    const team = await Team.findOne({ _id: id, clubId: session.user.id });
    if (!team) return NextResponse.json({ error: "Team not found" }, { status: 404 });

    const result = await Player.updateOne(
      { _id: playerId, clubId: session.user.id },
      { $pull: { teams: { teamId: id } } }
    );

    if (result.modifiedCount === 0) {
      return NextResponse.json({ error: "Player not found in this team" }, { status: 404 });
    }

    return NextResponse.json({ message: `Player removed from ${team.name}` });
  } catch (error) {
    console.error("Remove player from team error:", error);
    return NextResponse.json({ error: "Failed to remove player" }, { status: 500 });
  }
}
