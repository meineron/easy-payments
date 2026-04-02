import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import dbConnect from "@/lib/mongodb";
import Player from "@/models/Player";

export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session || session.user.role !== "club") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    await dbConnect();

    const [positions, secondaryPositions, schools] = await Promise.all([
      Player.distinct("primaryPosition", { clubId: session.user.id, primaryPosition: { $ne: "" } }),
      Player.distinct("secondaryPosition", { clubId: session.user.id, secondaryPosition: { $ne: "" } }),
      Player.distinct("school", { clubId: session.user.id, school: { $ne: "" } }),
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
