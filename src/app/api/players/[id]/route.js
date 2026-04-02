import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import dbConnect from "@/lib/mongodb";
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

    const player = await Player.findOne({ _id: id, clubId: session.user.id })
      .populate("registrationTeamId", "name season gender teamType")
      .populate("teams.teamId", "name season gender teamType costCents")
      .populate("parents", "firstName lastName email phonePrefix phone");

    if (!player) {
      return NextResponse.json({ error: "Player not found" }, { status: 404 });
    }

    return NextResponse.json({ player });
  } catch (error) {
    console.error("Get player error:", error);
    return NextResponse.json({ error: "Failed to get player" }, { status: 500 });
  }
}

export async function PUT(request, { params }) {
  try {
    const session = await getServerSession(authOptions);
    if (!session || session.user.role !== "club") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;
    const body = await request.json();
    await dbConnect();

    const player = await Player.findOne({ _id: id, clubId: session.user.id });
    if (!player) {
      return NextResponse.json({ error: "Player not found" }, { status: 404 });
    }

    const fields = [
      "firstName", "lastName", "dateOfBirth", "gender",
      "primaryPosition", "secondaryPosition", "school",
      "joinDate", "phoneNumber", "address", "city", "state", "zip", "email",
    ];

    for (const field of fields) {
      if (body[field] !== undefined) {
        player[field] = body[field];
      }
    }

    if (body.teams !== undefined) {
      player.teams = body.teams;
    }

    if (body.registrationTeamId !== undefined) {
      player.registrationTeamId = body.registrationTeamId || null;
    }

    if (body.parentIds !== undefined) {
      const oldParentIds = player.parents.map((p) => p.toString());
      const newParentIds = body.parentIds;

      const removed = oldParentIds.filter((id) => !newParentIds.includes(id));
      const added = newParentIds.filter((id) => !oldParentIds.includes(id));

      if (removed.length > 0) {
        await Parent.updateMany(
          { _id: { $in: removed }, clubId: session.user.id },
          { $pull: { players: player._id } }
        );
      }
      if (added.length > 0) {
        await Parent.updateMany(
          { _id: { $in: added }, clubId: session.user.id },
          { $addToSet: { players: player._id } }
        );
      }

      player.parents = newParentIds;
    }

    await player.save();

    const populated = await Player.findById(player._id)
      .populate("registrationTeamId", "name season gender teamType")
      .populate("teams.teamId", "name season gender teamType costCents")
      .populate("parents", "firstName lastName email phonePrefix phone");

    return NextResponse.json({ player: populated });
  } catch (error) {
    if (error.code === 11000) {
      return NextResponse.json({ error: "A player with this name and date of birth already exists" }, { status: 409 });
    }
    console.error("Update player error:", error);
    return NextResponse.json({ error: "Failed to update player" }, { status: 500 });
  }
}

export async function DELETE(request, { params }) {
  try {
    const session = await getServerSession(authOptions);
    if (!session || session.user.role !== "club") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;
    await dbConnect();

    const player = await Player.findOneAndDelete({ _id: id, clubId: session.user.id });
    if (!player) {
      return NextResponse.json({ error: "Player not found" }, { status: 404 });
    }

    await Parent.updateMany(
      { clubId: session.user.id, players: player._id },
      { $pull: { players: player._id } }
    );

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Delete player error:", error);
    return NextResponse.json({ error: "Failed to delete player" }, { status: 500 });
  }
}
