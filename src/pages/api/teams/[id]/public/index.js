import { connectMain } from "@/lib/mongodb";
import { resolvePublicContext } from "@/lib/club-context";
import Club from "@/models/Club";

async function _GET(req, res) {
  try {
    const { id } = req.query;
    const ctx = await resolvePublicContext("team", id);
    if (!ctx) {
      return res.status(404).json({ error: "Team not found" });
    }

    const team = await ctx.models.Team.findById(id);
    if (!team) {
      return res.status(404).json({ error: "Team not found" });
    }

    await connectMain();
    const club = await Club.findById(team.clubId).select("name");
    if (!club) {
      return res.status(404).json({ error: "Club not found" });
    }

    return res.status(200).json({
      team: {
        _id: team._id,
        name: team.name,
        season: team.season,
        gender: team.gender,
        teamType: team.teamType,
        costCents: team.costCents,
        loyaltyDiscountCents: team.loyaltyDiscountCents || 0,
        activityStartDate: team.activityStartDate,
      },
      clubName: club.name,
    });
  } catch (error) {
    console.error("Public team fetch error:", error);
    return res.status(500).json({ error: "Failed to load team" });
  }
}
export default async function handler(req, res) {
  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });
  return _GET(req, res);
}
