import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import dbConnect from "@/lib/mongodb";
import Club from "@/models/Club";

export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session || session.user.role !== "club") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    await dbConnect();

    const club = await Club.findById(session.user.id, "name username logoUrl").lean();
    if (!club) return NextResponse.json({ error: "Club not found" }, { status: 404 });

    return NextResponse.json({ club: { name: club.name, username: club.username, logoUrl: club.logoUrl || null } });
  } catch (error) {
    console.error("Get profile error:", error);
    return NextResponse.json({ error: "Failed to get profile" }, { status: 500 });
  }
}

export async function PUT(request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session || session.user.role !== "club") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    await dbConnect();

    const body = await request.json();
    const club = await Club.findById(session.user.id);
    if (!club) return NextResponse.json({ error: "Club not found" }, { status: 404 });

    if (body.name !== undefined && body.name.trim()) {
      club.name = body.name.trim();
    }
    if (body.logoUrl !== undefined) {
      club.logoUrl = body.logoUrl || null;
    }

    await club.save();

    return NextResponse.json({ club: { name: club.name, username: club.username, logoUrl: club.logoUrl || null } });
  } catch (error) {
    console.error("Update profile error:", error);
    return NextResponse.json({ error: "Failed to update profile" }, { status: 500 });
  }
}
