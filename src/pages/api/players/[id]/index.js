import { getClubContext, dualSave, dualWrite } from "@/lib/club-context";
import { toDobString } from "@/lib/dob";

async function _GET(req, res) {
  try {
    const { ctx, error } = await getClubContext(req, res);
    if (error) return res.status(200).json(error.body, { status: error.status });
    const { Player } = ctx.models;

    const { id } = req.query;

    const player = await Player.findOne({ _id: id, clubId: ctx.clubId })
      .populate("registrationTeamId", "name season gender teamType")
      .populate("teams.teamId", "name season gender teamType costCents")
      .populate("parents", "firstName lastName email phonePrefix phone");

    if (!player) {
      return res.status(404).json({ error: "Player not found" });
    }

    return res.status(200).json({ player });
  } catch (error) {
    console.error("Get player error:", error);
    return res.status(500).json({ error: "Failed to get player" });
  }
}

async function _PUT(req, res) {
  try {
    const { ctx, error } = await getClubContext(req, res);
    if (error) return res.status(200).json(error.body, { status: error.status });
    const { Player } = ctx.models;

    const { id } = req.query;
    const body = req.body;

    const player = await Player.findOne({ _id: id, clubId: ctx.clubId });
    if (!player) {
      return res.status(404).json({ error: "Player not found" });
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

    return res.status(409).json({ player: populated });
  } catch (error) {
    if (error.code === 11000) {
      return res.status(200).json({ error: "A player with this name and date of birth already exists" });
    }
    console.error("Update player error:", error);
    return res.status(500).json({ error: "Failed to update player" });
  }
}

async function _DELETE(req, res) {
  try {
    const { ctx, error } = await getClubContext(req, res);
    if (error) return res.status(200).json(error.body, { status: error.status });

    const { id } = req.query;

    const player = await dualWrite(ctx, (M) => M.Player.findOneAndDelete({ _id: id, clubId: ctx.clubId }));
    if (!player) {
      return res.status(404).json({ error: "Player not found" });
    }

    await dualWrite(ctx, (M) => M.Parent.updateMany(
      { clubId: ctx.clubId, players: player._id },
      { $pull: { players: player._id } },
    ));

    return res.status(200).json({ success: true });
  } catch (error) {
    console.error("Delete player error:", error);
    return res.status(500).json({ error: "Failed to delete player" });
  }
}
export default async function handler(req, res) {
  if (req.method === "GET") {
    return _GET(req, res);
  } else if (req.method === "PUT") {
    return _PUT(req, res);
  } else if (req.method === "DELETE") {
    return _DELETE(req, res);
  } else {
    return res.status(405).json({ error: "Method not allowed" });
  }
}
