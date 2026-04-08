import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import dbConnect from "@/lib/mongodb";
import Player from "@/models/Player";
import Parent from "@/models/Parent";
import Team from "@/models/Team";

export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session || session.user.role !== "club") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    await dbConnect();

    const clubId = session.user.id;

    const [players, parents, teams] = await Promise.all([
      Player.find({ clubId }, "firstName lastName email teams parents")
        .populate("teams.teamId", "name season")
        .populate("parents", "firstName lastName email")
        .sort("lastName firstName")
        .lean(),
      Parent.find({ clubId }, "firstName lastName email")
        .sort("lastName firstName")
        .lean(),
      Team.find({ clubId }, "name season")
        .sort("name")
        .lean(),
    ]);

    return NextResponse.json({ players, parents, teams });
  } catch (error) {
    console.error("Get recipients error:", error);
    return NextResponse.json({ error: "Failed to load recipients" }, { status: 500 });
  }
}
