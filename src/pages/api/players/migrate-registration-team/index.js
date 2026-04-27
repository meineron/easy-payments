import { getClubContext, dualSave } from "@/lib/club-context";

async function _POST(req, res) {
  try {
    const { ctx, error } = await getClubContext(req, res);
    if (error) return res.status(200).json(error.body, { status: error.status });
    const { Player } = ctx.models;

    const players = await Player.find({
      clubId: ctx.clubId,
      $or: [
        { registrationTeamId: null },
        { registrationTeamId: { $exists: false } },
      ],
      "teams.0": { $exists: true },
    });

    let updated = 0;
    for (const player of players) {
      player.registrationTeamId = player.teams[0].teamId;
      await dualSave(ctx, player);
      updated++;
    }

    return res.status(200).json({
      message: `Migration complete: ${updated} player(s) updated`,
      updated,
    });
  } catch (error) {
    console.error("Migration error:", error);
    return res.status(500).json({ error: "Migration failed" });
  }
}

async function _GET(req, res) {
  try {
    const { ctx, error } = await getClubContext(req, res);
    if (error) return res.status(200).json(error.body, { status: error.status });
    const { Player } = ctx.models;

    const total = await Player.countDocuments({ clubId: ctx.clubId });
    const needsMigration = await Player.countDocuments({
      clubId: ctx.clubId,
      $or: [
        { registrationTeamId: null },
        { registrationTeamId: { $exists: false } },
      ],
      "teams.0": { $exists: true },
    });

    return res.status(200).json({ total, needsMigration });
  } catch (error) {
    console.error("Migration check error:", error);
    return res.status(500).json({ error: "Check failed" });
  }
}
export default async function handler(req, res) {
  if (req.method === "POST") {
    return _POST(req, res);
  } else if (req.method === "GET") {
    return _GET(req, res);
  } else {
    return res.status(405).json({ error: "Method not allowed" });
  }
}
