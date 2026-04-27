import { getClubContext } from "@/lib/club-context";

async function _GET(req, res) {
  try {
    const { ctx, error } = await getClubContext(req, res);
    if (error) return res.status(200).json(error.body, { status: error.status });
    const { Activity, Registration, Player } = ctx.models;

    const { id: playerId } = req.query;

    const player = await Player.findOne({ _id: playerId, clubId: ctx.clubId }).select("teams firstName lastName").lean();
    if (!player) {
      return res.status(200).json({ activities: [] });
    }

    const playerTeamIds = (player.teams || []).map((t) => t.teamId);

    const activities = await Activity.find({
      clubId: ctx.clubId,
      "teams.teamId": { $in: playerTeamIds },
    }).select("title season type status teams").lean();

    const registrations = await Registration.find({
      clubId: ctx.clubId,
      teamId: { $in: playerTeamIds },
      playerFirstName: player.firstName,
      playerLastName: player.lastName,
    }).select("teamId status finalCostCents collectedCents").lean();

    const regByTeam = {};
    registrations.forEach((r) => {
      const tid = r.teamId?.toString();
      if (tid) regByTeam[tid] = r;
    });

    const result = activities.map((a) => {
      const actTeamIds = (a.teams || []).map((t) => t.teamId?.toString());
      const matchingReg = actTeamIds.map((tid) => regByTeam[tid]).find(Boolean);
      return {
        title: a.title,
        season: a.season,
        type: a.type,
        status: matchingReg?.status || "not registered",
        finalCostCents: matchingReg?.finalCostCents ?? 0,
        collectedCents: matchingReg?.collectedCents ?? 0,
      };
    });

    return res.status(200).json({ activities: result });
  } catch (error) {
    console.error("Player activities error:", error);
    return res.status(500).json({ error: "Failed to fetch activities" });
  }
}
export default async function handler(req, res) {
  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });
  return _GET(req, res);
}
