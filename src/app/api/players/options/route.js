import { NextResponse } from "next/server";
import { getClubContext } from "@/lib/club-context";

export async function GET() {
  try {
    const { ctx, error } = await getClubContext();
    if (error) return NextResponse.json(error.body, { status: error.status });
    const { Player } = ctx.models;

    const [positions, secondaryPositions, schools] = await Promise.all([
      Player.distinct("primaryPosition", { clubId: ctx.clubId, primaryPosition: { $ne: "" } }),
      Player.distinct("secondaryPosition", { clubId: ctx.clubId, secondaryPosition: { $ne: "" } }),
      Player.distinct("school", { clubId: ctx.clubId, school: { $ne: "" } }),
    ]);

    const allPositions = [...new Set([...positions, ...secondaryPositions])].sort();

    return NextResponse.json({
      positions: allPositions,
      schools: schools.sort(),
    });
  } catch (error) {
    console.error("Player options error:", error);
    return NextResponse.json({ error: "Failed to get options" }, { status: 500 });
  }
}
