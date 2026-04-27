import mongoose from "mongoose";
import { getClubContext, dualWrite } from "@/lib/club-context";

const MAX_IDS = 500;

async function _POST(req, res) {
  try {
    const { ctx, error } = await getClubContext(req, res);
    if (error) return res.status(200).json(error.body, { status: error.status });
    const { Team, Player, Order, Activity } = ctx.models;

    const body = req.body;
    const rawIds = Array.isArray(body.teamIds) ? body.teamIds : [];
    if (rawIds.length === 0) {
      return res.status(400).json({ error: "teamIds array is required" });
    }
    if (rawIds.length > MAX_IDS) {
      return res.status(400).json({ error: `At most ${MAX_IDS} teams per request` });
    }

    const clubId = ctx.clubId;
    const teamIds = [...new Set(rawIds.map((id) => String(id)))].filter((id) => mongoose.Types.ObjectId.isValid(id));
    if (teamIds.length === 0) {
      return res.status(400).json({ error: "No valid team ids" });
    }

    const owned = await Team.find({ _id: { $in: teamIds }, clubId }).select("_id").lean();
    const ownedSet = new Set(owned.map((t) => String(t._id)));
    const notOwned = teamIds.filter((id) => !ownedSet.has(id));

    const blocked = new Map();

    const playerBusy = await Player.find({
      clubId,
      $or: [
        { "teams.teamId": { $in: teamIds } },
        { registrationTeamId: { $in: teamIds } },
      ],
    }).select("teams registrationTeamId").lean();

    for (const p of playerBusy) {
      for (const row of p.teams || []) {
        const tid = row.teamId ? String(row.teamId) : "";
        if (tid && ownedSet.has(tid)) blocked.set(tid, "player");
      }
      const rid = p.registrationTeamId ? String(p.registrationTeamId) : "";
      if (rid && ownedSet.has(rid)) blocked.set(rid, "player");
    }

    const orderBusy = await Order.find({
      clubId,
      teamId: { $in: teamIds },
    }).distinct("teamId");
    for (const oid of orderBusy) {
      const tid = String(oid);
      if (ownedSet.has(tid)) blocked.set(tid, "order");
    }

    const activities = await Activity.find({
      clubId,
      "teams.teamId": { $in: teamIds },
    }).select("teams").lean();
    for (const act of activities) {
      for (const row of act.teams || []) {
        const tid = row.teamId ? String(row.teamId) : "";
        if (tid && ownedSet.has(tid)) blocked.set(tid, "activity");
      }
    }

    const toDelete = teamIds.filter((id) => ownedSet.has(id) && !blocked.has(id));
    const skipped = [...blocked.entries()].map(([teamId, reason]) => ({ teamId, reason }));

    if (toDelete.length === 0) {
      return res.status(200).json({
        deleted: 0,
        skipped,
        notOwnedCount: notOwned.length,
        message: "No teams could be deleted (all skipped or not found)",
      });
    }

    const result = await dualWrite(ctx, (M) => M.Team.deleteMany({ _id: { $in: toDelete }, clubId }));

    return res.status(200).json({
      deleted: result.deletedCount || 0,
      skipped,
      notOwnedCount: notOwned.length,
    });
  } catch (error) {
    console.error("Bulk delete teams error:", error);
    return res.status(500).json({ error: "Failed to delete teams" });
  }
}
export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  return _POST(req, res);
}
