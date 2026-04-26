import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { connectMain } from "@/lib/mongodb";
import Club from "@/models/Club";

function activeClubId(session) {
  return session?.user?.activeClubId || session?.user?.id || null;
}

export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session || session.user.role !== "club") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    await connectMain();

    const clubId = activeClubId(session);
    const club = await Club.findById(clubId, "name username logoUrl language supportEmail smtpHost smtpPort smtpEmail smtpPassword").lean();
    if (!club) return NextResponse.json({ error: "Club not found" }, { status: 404 });

    return NextResponse.json({ club: {
      name: club.name, username: club.username, logoUrl: club.logoUrl || null, language: club.language || "en",
      supportEmail: club.supportEmail || "",
      smtpHost: club.smtpHost || "", smtpPort: club.smtpPort || 587, smtpEmail: club.smtpEmail || "",
      smtpPassword: club.smtpPassword ? "••••••••" : "",
    } });
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
    await connectMain();

    const body = await request.json();
    const clubId = activeClubId(session);
    const club = await Club.findById(clubId);
    if (!club) return NextResponse.json({ error: "Club not found" }, { status: 404 });

    if (body.name !== undefined && body.name.trim()) {
      club.name = body.name.trim();
    }
    if (body.logoUrl !== undefined) {
      club.logoUrl = body.logoUrl || null;
    }
    if (body.language !== undefined && ["en", "he"].includes(body.language)) {
      club.language = body.language;
    }
    if (body.supportEmail !== undefined) club.supportEmail = body.supportEmail.trim();
    if (body.smtpHost !== undefined) club.smtpHost = body.smtpHost.trim();
    if (body.smtpPort !== undefined) club.smtpPort = parseInt(body.smtpPort, 10) || 587;
    if (body.smtpEmail !== undefined) club.smtpEmail = body.smtpEmail.trim();
    if (body.smtpPassword !== undefined && body.smtpPassword !== "••••••••") {
      club.smtpPassword = body.smtpPassword;
    }

    await club.save();

    return NextResponse.json({ club: {
      name: club.name, username: club.username, logoUrl: club.logoUrl || null, language: club.language || "en",
      supportEmail: club.supportEmail || "",
      smtpHost: club.smtpHost || "", smtpPort: club.smtpPort || 587, smtpEmail: club.smtpEmail || "",
      smtpPassword: club.smtpPassword ? "••••••••" : "",
    } });
  } catch (error) {
    console.error("Update profile error:", error);
    return NextResponse.json({ error: "Failed to update profile" }, { status: 500 });
  }
}
