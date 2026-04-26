import { NextResponse } from "next/server";
import { getClubContext } from "@/lib/club-context";

export async function GET(request, { params }) {
  try {
    const { ctx, error } = await getClubContext();
    if (error) return NextResponse.json(error.body, { status: error.status });
    const { Activity, Registration, Player } = ctx.models;

    const { id: playerId } = await params;

    const player = await Player.findOne({ _id: playerId, clubId: ctx.clubId }).select("teams firstName lastName").lean();
    if (!player) {
      return NextResponse.json({ activities: [] });
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

    return NextResponse.json({ activities: result });
  } catch (error) {
    console.error("Player activities error:", error);
    return NextResponse.json({ error: "Failed to fetch activities" }, { status: 500 });
  }
}
