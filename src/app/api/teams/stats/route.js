import { NextResponse } from "next/server";
import mongoose from "mongoose";
import { getClubContext } from "@/lib/club-context";

export async function GET() {
  try {
    const { ctx, error } = await getClubContext();
    if (error) return NextResponse.json(error.body, { status: error.status });
    const { Registration, Player } = ctx.models;

    const clubObjectId = mongoose.Types.ObjectId.createFromHexString(String(ctx.clubId));

    const [regResults, playerResults] = await Promise.all([
      Registration.aggregate([
        { $match: { clubId: clubObjectId } },
        {
          $group: {
            _id: "$teamId",
            expectedRevenue: { $sum: "$finalCostCents" },
            committedRevenue: {
              $sum: {
                $cond: [{ $in: ["$status", ["active", "completed"]] }, "$finalCostCents", 0],
              },
            },
            totalCollected: { $sum: "$collectedCents" },
            totalPlayers: { $sum: 1 },
            committedPlayers: {
              $sum: {
                $cond: [{ $in: ["$status", ["active", "completed"]] }, 1, 0],
              },
            },
          },
        },
      ]),
      Player.aggregate([
        { $match: { clubId: clubObjectId } },
        { $unwind: "$teams" },
        {
          $group: {
            _id: "$teams.teamId",
            teamMembers: { $sum: 1 },
          },
        },
      ]),
    ]);

    const byTeam = {};

    for (const r of regResults) {
      const tid = r._id.toString();
      if (!byTeam[tid]) byTeam[tid] = { expectedRevenue: 0, committedRevenue: 0, totalCollected: 0, totalPlayers: 0, committedPlayers: 0, teamMembers: 0 };
      byTeam[tid].expectedRevenue = r.expectedRevenue;
      byTeam[tid].committedRevenue = r.committedRevenue;
      byTeam[tid].totalCollected = r.totalCollected;
      byTeam[tid].totalPlayers = r.totalPlayers;
      byTeam[tid].committedPlayers = r.committedPlayers;
    }

    for (const p of playerResults) {
      const tid = p._id.toString();
      if (!byTeam[tid]) byTeam[tid] = { expectedRevenue: 0, committedRevenue: 0, totalCollected: 0, totalPlayers: 0, committedPlayers: 0, teamMembers: 0 };
      byTeam[tid].teamMembers = p.teamMembers;
    }

    let globalExpected = 0, globalCommitted = 0, globalCollected = 0;
    let globalTotalPlayers = 0, globalCommittedPlayers = 0, globalTeamMembers = 0;

    for (const stats of Object.values(byTeam)) {
      globalExpected += stats.expectedRevenue;
      globalCommitted += stats.committedRevenue;
      globalCollected += stats.totalCollected;
      globalTotalPlayers += stats.totalPlayers;
      globalCommittedPlayers += stats.committedPlayers;
      globalTeamMembers += stats.teamMembers;
    }

    return NextResponse.json({
      byTeam,
      global: {
        expectedRevenue: globalExpected,
        committedRevenue: globalCommitted,
        totalCollected: globalCollected,
        totalPlayers: globalTotalPlayers,
        committedPlayers: globalCommittedPlayers,
        teamMembers: globalTeamMembers,
      },
    });
  } catch (error) {
    console.error("Team stats error:", error);
    return NextResponse.json({ error: "Failed to load stats" }, { status: 500 });
  }
}
