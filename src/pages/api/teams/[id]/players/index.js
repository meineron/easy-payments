import { getClubContext, dualWrite } from "@/lib/club-context";

async function _GET(req, res) {
  try {
    const { ctx, error } = await getClubContext(req, res);
    if (error) return res.status(200).json(error.body, { status: error.status });
    const { Team, Player } = ctx.models;

    const { id } = req.query;
    const team = await Team.findOne({ _id: id, clubId: ctx.clubId });
    if (!team) {
      return res.status(404).json({ error: "Team not found" });
    }

    const players = await Player.find({
      clubId: ctx.clubId,
      "teams.teamId": id,
    })
      .populate("parents", "firstName lastName email phonePrefix phone")
      .sort({ lastName: 1, firstName: 1 });

    return res.status(200).json({ players });
  } catch (error) {
    console.error("List team players error:", error);
    return res.status(500).json({ error: "Failed to list players" });
  }
}

async function _POST(req, res) {
  try {
    const { ctx, error } = await getClubContext(req, res);
    if (error) return res.status(200).json(error.body, { status: error.status });
    const { Team } = ctx.models;

    const { id } = req.query;
    const body = req.body;

    const team = await Team.findOne({ _id: id, clubId: ctx.clubId });
    if (!team) {
      return res.status(404).json({ error: "Team not found" });
    }

    const { playerIds } = body;
    if (!Array.isArray(playerIds) || playerIds.length === 0) {
      return res.status(400).json({ error: "playerIds array is required" });
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

    return res.status(200).json({
      added: result.modifiedCount,
      message: `${result.modifiedCount} player(s) added to ${team.name}`,
    });
  } catch (error) {
    console.error("Add players to team error:", error);
    return res.status(500).json({ error: "Failed to add players" });
  }
}

async function _DELETE(req, res) {
  try {
    const { ctx, error } = await getClubContext(req, res);
    if (error) return res.status(200).json(error.body, { status: error.status });
    const { Team } = ctx.models;

    const { id } = req.query;
    const { playerId } = req.body;

    if (!playerId) {
      return res.status(400).json({ error: "playerId is required" });
    }

    const team = await Team.findOne({ _id: id, clubId: ctx.clubId });
    if (!team) return res.status(404).json({ error: "Team not found" });

    const result = await dualWrite(ctx, (M) => M.Player.updateOne(
      { _id: playerId, clubId: ctx.clubId },
      { $pull: { teams: { teamId: id } } },
    ));

    if (result.modifiedCount === 0) {
      return res.status(404).json({ error: "Player not found in this team" });
    }

    return res.status(200).json({ message: `Player removed from ${team.name}` });
  } catch (error) {
    console.error("Remove player from team error:", error);
    return res.status(500).json({ error: "Failed to remove player" });
  }
}
export default async function handler(req, res) {
  if (req.method === "GET") {
    return _GET(req, res);
  } else if (req.method === "POST") {
    return _POST(req, res);
  } else if (req.method === "DELETE") {
    return _DELETE(req, res);
  } else {
    return res.status(405).json({ error: "Method not allowed" });
  }
}
