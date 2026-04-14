import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import dbConnect from "@/lib/mongodb";
import ClubUser from "@/models/ClubUser";
import Team from "@/models/Team";

export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session || session.user.role !== "club") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    await dbConnect();

    const users = await ClubUser.find({ clubId: session.user.id })
      .select("-password -temporaryPassword")
      .sort({ createdAt: -1 })
      .lean();

    const teamIds = [...new Set(users.flatMap((u) => u.teams.map((t) => t.teamId.toString())))];
    const teams = teamIds.length
      ? await Team.find({ _id: { $in: teamIds } }).select("name season").lean()
      : [];
    const teamMap = Object.fromEntries(teams.map((t) => [t._id.toString(), t]));

    const enriched = users.map((u) => ({
      ...u,
      teams: u.teams.map((t) => ({
        ...t,
        teamName: teamMap[t.teamId?.toString()]?.name || "",
        teamSeason: teamMap[t.teamId?.toString()]?.season || "",
      })),
    }));

    return NextResponse.json({ users: enriched });
  } catch (error) {
    console.error("List club users error:", error);
    return NextResponse.json({ error: "Failed to list users" }, { status: 500 });
  }
}

export async function POST(request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session || session.user.role !== "club") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    await dbConnect();

    const body = await request.json();
    const { firstName, lastName, email, phonePrefix, phone, mainRole, customRoleLabel, language, teams } = body;

    if (!firstName || !lastName || !email || !mainRole) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    const existing = await ClubUser.findOne({ clubId: session.user.id, email: email.toLowerCase() });
    if (existing) {
      return NextResponse.json({ error: "A user with this email already exists" }, { status: 409 });
    }

    const user = await ClubUser.create({
      clubId: session.user.id,
      firstName: firstName.trim(),
      lastName: lastName.trim(),
      email: email.trim().toLowerCase(),
      phonePrefix: phonePrefix || "+1",
      phone: phone || "",
      mainRole,
      customRoleLabel: mainRole === "custom" ? (customRoleLabel || "").trim() : "",
      language: language || "en",
      teams: (teams || []).map((t) => ({ teamId: t.teamId, role: t.role })),
      status: "draft",
    });

    return NextResponse.json({ user }, { status: 201 });
  } catch (error) {
    console.error("Create club user error:", error);
    return NextResponse.json({ error: "Failed to create user" }, { status: 500 });
  }
}
