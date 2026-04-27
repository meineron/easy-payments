import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import dbConnect from "@/lib/mongodb";
import Club from "@/models/Club";

async function requireAdmin() {
  const session = await getServerSession(authOptions);
  if (!session || session.user?.role !== "admin") {
    return { error: res.status(401).json({ error: "Unauthorized" }) };
  }
  return { session };
}

// POST /api/admin/clubs/:id/deactivate  → soft-delete a club.
async function _POST(req, res) {
  const { error, session } = await requireAdmin();
  if (error) return error;

  const { id } = req.query;

  let body = {};
  try {
    body = req.body;
  } catch (_) { /* empty body is fine */ }
  const reason = typeof body?.reason === "string" ? body.reason.trim() : "";

  await dbConnect();
  const club = await Club.findById(id);
  if (!club) {
    return res.status(404).json({ error: "Club not found" });
  }

  if (club.status === "deactivated") {
    return res.status(400).json({ error: "Club is already deactivated" });
  }

  club.status = "deactivated";
  club.deactivatedAt = new Date();
  club.deactivatedBy = session.user?.username || session.user?.name || "admin";
  club.deactivationReason = reason;
  await club.save();

  return res.status(200).json({
    club: {
      _id: club._id,
      name: club.name,
      status: club.status,
      deactivatedAt: club.deactivatedAt,
      deactivatedBy: club.deactivatedBy,
      deactivationReason: club.deactivationReason,
    },
  });
}
export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  return _POST(req, res);
}
