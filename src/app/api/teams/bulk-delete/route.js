import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import mongoose from "mongoose";
import { authOptions } from "@/lib/auth";
import dbConnect from "@/lib/mongodb";
import Team from "@/models/Team";
import Player from "@/models/Player";
import Order from "@/models/Order";
import Activity from "@/models/Activity";

const MAX_IDS = 500;

export async function POST(request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session || session.user.role !== "club") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const rawIds = Array.isArray(body.teamIds) ? body.teamIds : [];
    if (rawIds.length === 0) {
      return NextResponse.json({ error: "teamIds array is required" }, { status: 400 });
    }
    if (rawIds.length > MAX_IDS) {
      return NextResponse.json({ error: `At most ${MAX_IDS} teams per request` }, { status: 400 });
    }

    const clubId = session.user.id;
    const teamIds = [...new Set(rawIds.map((id) => String(id)))].filter((id) => mongoose.Types.ObjectId.isValid(id));
    if (teamIds.length === 0) {
      return NextResponse.json({ error: "No valid team ids" }, { status: 400 });
    }

    await dbConnect();

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
      return NextResponse.json({
        deleted: 0,
        skipped,
        notOwnedCount: notOwned.length,
        message: "No teams could be deleted (all skipped or not found)",
      });
    }

    const result = await Team.deleteMany({ _id: { $in: toDelete }, clubId });

    return NextResponse.json({
      deleted: result.deletedCount || 0,
      skipped,
      notOwnedCount: notOwned.length,
    });
  } catch (error) {
    console.error("Bulk delete teams error:", error);
    return NextResponse.json({ error: "Failed to delete teams" }, { status: 500 });
  }
}
