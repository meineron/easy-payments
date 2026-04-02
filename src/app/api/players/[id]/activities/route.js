import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import dbConnect from "@/lib/mongodb";
import Activity from "@/models/Activity";
import Registration from "@/models/Registration";
import Player from "@/models/Player";

export async function GET(request, { params }) {
  try {
    const session = await getServerSession(authOptions);
    if (!session || session.user.role !== "club") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id: playerId } = await params;
    await dbConnect();

    const player = await Player.findOne({ _id: playerId, clubId: session.user.id }).select("teams firstName lastName").lean();
    if (!player) {
      return NextResponse.json({ activities: [] });
    }

    const playerTeamIds = (player.teams || []).map((t) => t.teamId);

    const activities = await Activity.find({
      clubId: session.user.id,
      "teams.teamId": { $in: playerTeamIds },
    }).select("title season type status teams").lean();

    const registrations = await Registration.find({
      clubId: session.user.id,
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
