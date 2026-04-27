import { getClubContext, dualSave } from "@/lib/club-context";

async function _GET(req, res) {
  try {
    const { ctx, error } = await getClubContext(req, res);
    if (error) return res.status(200).json(error.body, { status: error.status });
    const { Player, Team, Registration } = ctx.models;

    const { id } = req.query;

    const player = await Player.findOne({ _id: id, clubId: ctx.clubId });
    if (!player) {
      return res.status(404).json({ error: "Player not found" });
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

    return res.status(200).json({ allTeams, playerTeamIds, registrationTeamId, registrationStatuses });
  } catch (error) {
    console.error("Get player teams error:", error);
    return res.status(500).json({ error: "Failed to get player teams" });
  }
}

async function _PUT(req, res) {
  try {
    const { ctx, error } = await getClubContext(req, res);
    if (error) return res.status(200).json(error.body, { status: error.status });
    const { Player, Team } = ctx.models;

    const { id } = req.query;
    const { teamIds, registrationTeamId } = req.body;

    if (!Array.isArray(teamIds)) {
      return res.status(400).json({ error: "teamIds array is required" });
    }

    const player = await Player.findOne({ _id: id, clubId: ctx.clubId });
    if (!player) {
      return res.status(404).json({ error: "Player not found" });
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

    return res.status(200).json({
      message: `Player updated: registration team set, ${newTeams.length} total team(s)`,
      teamCount: newTeams.length,
    });
  } catch (error) {
    console.error("Update player teams error:", error);
    return res.status(500).json({ error: "Failed to update teams" });
  }
}

function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
export default async function handler(req, res) {
  if (req.method === "GET") {
    return _GET(req, res);
  } else if (req.method === "PUT") {
    return _PUT(req, res);
  } else {
    return res.status(405).json({ error: "Method not allowed" });
  }
}
