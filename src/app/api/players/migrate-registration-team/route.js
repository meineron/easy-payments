import { NextResponse } from "next/server";
import { getClubContext, dualSave } from "@/lib/club-context";

export async function POST() {
  try {
    const { ctx, error } = await getClubContext();
    if (error) return NextResponse.json(error.body, { status: error.status });
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

    return NextResponse.json({
      message: `Migration complete: ${updated} player(s) updated`,
      updated,
    });
  } catch (error) {
    console.error("Migration error:", error);
    return NextResponse.json({ error: "Migration failed" }, { status: 500 });
  }
}

export async function GET() {
  try {
    const { ctx, error } = await getClubContext();
    if (error) return NextResponse.json(error.body, { status: error.status });
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

    return NextResponse.json({ total, needsMigration });
  } catch (error) {
    console.error("Migration check error:", error);
    return NextResponse.json({ error: "Check failed" }, { status: 500 });
  }
}
