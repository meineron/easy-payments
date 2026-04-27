import { getClubContext } from "@/lib/club-context";

async function _GET(req, res) {
  try {
    const { ctx, error } = await getClubContext(req, res);
    if (error) return res.status(200).json(error.body, { status: error.status });
    const { Player } = ctx.models;

    const [positions, secondaryPositions, schools] = await Promise.all([
      Player.distinct("primaryPosition", { clubId: ctx.clubId, primaryPosition: { $ne: "" } }),
      Player.distinct("secondaryPosition", { clubId: ctx.clubId, secondaryPosition: { $ne: "" } }),
      Player.distinct("school", { clubId: ctx.clubId, school: { $ne: "" } }),
    ]);

    const allPositions = [...new Set([...positions, ...secondaryPositions])].sort();

    return res.status(200).json({
      positions: allPositions,
      schools: schools.sort(),
    });
  } catch (error) {
    console.error("Player options error:", error);
    return res.status(500).json({ error: "Failed to get options" });
  }
}
export default async function handler(req, res) {
  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });
  return _GET(req, res);
}
