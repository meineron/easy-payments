import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { connectMain } from "@/lib/mongodb";
import Club from "@/models/Club";

function activeClubId(session) {
  return session?.user?.activeClubId || session?.user?.id || null;
}

async function _GET(req, res) {
  try {
    const session = await getServerSession(authOptions);
    if (!session || session.user.role !== "club") {
      return res.status(401).json({ error: "Unauthorized" });
    }
    await connectMain();

    const clubId = activeClubId(session);
    const club = await Club.findById(clubId, "name username logoUrl language supportEmail smtpHost smtpPort smtpEmail smtpPassword").lean();
    if (!club) return res.status(404).json({ error: "Club not found" });

    return res.status(200).json({ club: {
      name: club.name, username: club.username, logoUrl: club.logoUrl || null, language: club.language || "en",
      supportEmail: club.supportEmail || "",
      smtpHost: club.smtpHost || "", smtpPort: club.smtpPort || 587, smtpEmail: club.smtpEmail || "",
      smtpPassword: club.smtpPassword ? "••••••••" : "",
    } });
  } catch (error) {
    console.error("Get profile error:", error);
    return res.status(500).json({ error: "Failed to get profile" });
  }
}

async function _PUT(req, res) {
  try {
    const session = await getServerSession(authOptions);
    if (!session || session.user.role !== "club") {
      return res.status(401).json({ error: "Unauthorized" });
    }
    await connectMain();

    const body = req.body;
    const clubId = activeClubId(session);
    const club = await Club.findById(clubId);
    if (!club) return res.status(404).json({ error: "Club not found" });

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

    return res.status(200).json({ club: {
      name: club.name, username: club.username, logoUrl: club.logoUrl || null, language: club.language || "en",
      supportEmail: club.supportEmail || "",
      smtpHost: club.smtpHost || "", smtpPort: club.smtpPort || 587, smtpEmail: club.smtpEmail || "",
      smtpPassword: club.smtpPassword ? "••••••••" : "",
    } });
  } catch (error) {
    console.error("Update profile error:", error);
    return res.status(500).json({ error: "Failed to update profile" });
  }
}
export default async function handler(req, res) {
  if (req.method === "GET") {
    return _GET(req, res);
  } else if (req.method === "PUT") {
    return _PUT(req, res);
  } else {
    return res.status(405).json({ error: "Method not allowed" });
  }
}
