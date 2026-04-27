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

// POST /api/admin/clubs/:id/reactivate  → restore a soft-deleted club.
async function _POST(req, res) {
  const { error } = await requireAdmin();
  if (error) return error;

  const { id } = req.query;

  await dbConnect();
  const club = await Club.findById(id);
  if (!club) {
    return res.status(404).json({ error: "Club not found" });
  }

  if (club.status !== "deactivated") {
    return res.status(400).json({ error: "Club is not deactivated" });
  }

  club.status = "active";
  club.deactivatedAt = null;
  club.deactivatedBy = null;
  club.deactivationReason = "";
  await club.save();

  return res.status(200).json({
    club: {
      _id: club._id,
      name: club.name,
      status: club.status,
    },
  });
}
export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  return _POST(req, res);
}
