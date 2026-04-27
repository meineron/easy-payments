import { getClubContext, dualSave } from "@/lib/club-context";

async function _GET(req, res) {
  try {
    const { ctx, error } = await getClubContext(req, res);
    if (error) return res.status(200).json(error.body, { status: error.status });
    const { Team, Registration, Player, Parent } = ctx.models;
    void Parent;

    const { id } = req.query;
    const team = await Team.findOne({ _id: id, clubId: ctx.clubId });
    if (!team) {
      return res.status(404).json({ error: "Team not found" });
    }

    const [registrations, teamPlayersRaw] = await Promise.all([
      Registration.find({ teamId: id }).sort({ createdAt: -1 }),
      Player.find({ clubId: ctx.clubId, "teams.teamId": id })
        .populate("registrationTeamId", "name season gender teamType")
        .populate("teams.teamId", "name season gender teamType")
        .populate("parents", "firstName lastName email phonePrefix phone")
        .sort({ lastName: 1, firstName: 1 }),
    ]);

    for (const p of teamPlayersRaw) {
      if (!p.registrationTeamId && p.teams.length > 0) {
        p.registrationTeamId = p.teams[0].teamId;
        await dualSave(ctx, p);
      }
    }

    return res.status(200).json({ registrations, teamPlayers: teamPlayersRaw });
  } catch (error) {
    console.error("List registrations error:", error);
    return res.status(500).json({ error: "Failed to list registrations" });
  }
}
export default async function handler(req, res) {
  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });
  return _GET(req, res);
}
