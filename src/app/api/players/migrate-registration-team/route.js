import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import dbConnect from "@/lib/mongodb";
import Player from "@/models/Player";

export async function POST() {
  try {
    const session = await getServerSession(authOptions);
    if (!session || session.user.role !== "club") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    await dbConnect();

    const players = await Player.find({
      clubId: session.user.id,
      $or: [
        { registrationTeamId: null },
        { registrationTeamId: { $exists: false } },
      ],
      "teams.0": { $exists: true },
    });

    let updated = 0;
    for (const player of players) {
      player.registrationTeamId = player.teams[0].teamId;
      await player.save();
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
    const session = await getServerSession(authOptions);
    if (!session || session.user.role !== "club") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    await dbConnect();

    const total = await Player.countDocuments({ clubId: session.user.id });
    const needsMigration = await Player.countDocuments({
      clubId: session.user.id,
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
