import { NextResponse } from "next/server";
import { getClubContext, dualSave, dualWrite } from "@/lib/club-context";
import { toDobString } from "@/lib/dob";

export async function GET(request, { params }) {
  try {
    const { ctx, error } = await getClubContext();
    if (error) return NextResponse.json(error.body, { status: error.status });
    const { Player } = ctx.models;

    const { id } = await params;

    const player = await Player.findOne({ _id: id, clubId: ctx.clubId })
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
    const { ctx, error } = await getClubContext();
    if (error) return NextResponse.json(error.body, { status: error.status });
    const { Player } = ctx.models;

    const { id } = await params;
    const body = await request.json();

    const player = await Player.findOne({ _id: id, clubId: ctx.clubId });
    if (!player) {
      return NextResponse.json({ error: "Player not found" }, { status: 404 });
    }

    const fields = [
      "firstName", "lastName", "dateOfBirth", "gender",
      "primaryPosition", "secondaryPosition", "school",
      "joinDate", "phonePrefix", "phoneNumber", "address", "city", "state", "zip", "email",
    ];

    for (const field of fields) {
      if (body[field] !== undefined) {
        player[field] = field === "dateOfBirth" ? toDobString(body[field]) : body[field];
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

      const removed = oldParentIds.filter((pid) => !newParentIds.includes(pid));
      const added = newParentIds.filter((pid) => !oldParentIds.includes(pid));

      if (removed.length > 0) {
        await dualWrite(ctx, (M) => M.Parent.updateMany(
          { _id: { $in: removed }, clubId: ctx.clubId },
          { $pull: { players: player._id } },
        ));
      }
      if (added.length > 0) {
        await dualWrite(ctx, (M) => M.Parent.updateMany(
          { _id: { $in: added }, clubId: ctx.clubId },
          { $addToSet: { players: player._id } },
        ));
      }

      player.parents = newParentIds;
    }

    await dualSave(ctx, player);

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
    const { ctx, error } = await getClubContext();
    if (error) return NextResponse.json(error.body, { status: error.status });

    const { id } = await params;

    const player = await dualWrite(ctx, (M) => M.Player.findOneAndDelete({ _id: id, clubId: ctx.clubId }));
    if (!player) {
      return NextResponse.json({ error: "Player not found" }, { status: 404 });
    }

    await dualWrite(ctx, (M) => M.Parent.updateMany(
      { clubId: ctx.clubId, players: player._id },
      { $pull: { players: player._id } },
    ));

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Delete player error:", error);
    return NextResponse.json({ error: "Failed to delete player" }, { status: 500 });
  }
}
