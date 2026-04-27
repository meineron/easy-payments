import { getClubContext } from "@/lib/club-context";

async function _GET(req, res) {
  try {
    const { ctx, error } = await getClubContext(req, res);
    if (error) return res.status(200).json(error.body, { status: error.status });
    const { Player, Parent, Team } = ctx.models;

    const [players, parents, teams] = await Promise.all([
      Player.find({ clubId: ctx.clubId }, "firstName lastName email phonePrefix phoneNumber teams parents")
        .populate("teams.teamId", "name season")
        .populate("parents", "firstName lastName email phonePrefix phone")
        .sort("lastName firstName")
        .lean(),
      Parent.find({ clubId: ctx.clubId }, "firstName lastName email phonePrefix phone")
        .sort("lastName firstName")
        .lean(),
      Team.find({ clubId: ctx.clubId }, "name season")
        .sort("name")
        .lean(),
    ]);

    return res.status(200).json({ players, parents, teams });
  } catch (error) {
    console.error("Get recipients error:", error);
    return res.status(500).json({ error: "Failed to load recipients" });
  }
}
export default async function handler(req, res) {
  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });
  return _GET(req, res);
}
