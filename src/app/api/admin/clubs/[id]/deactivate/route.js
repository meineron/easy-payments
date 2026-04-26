import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import dbConnect from "@/lib/mongodb";
import Club from "@/models/Club";

async function requireAdmin() {
  const session = await getServerSession(authOptions);
  if (!session || session.user?.role !== "admin") {
    return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  }
  return { session };
}

// POST /api/admin/clubs/:id/deactivate  → soft-delete a club.
export async function POST(request, { params }) {
  const { error, session } = await requireAdmin();
  if (error) return error;

  const { id } = await params;

  let body = {};
  try {
    body = await request.json();
  } catch (_) { /* empty body is fine */ }
  const reason = typeof body?.reason === "string" ? body.reason.trim() : "";

  await dbConnect();
  const club = await Club.findById(id);
  if (!club) {
    return NextResponse.json({ error: "Club not found" }, { status: 404 });
  }

  if (club.status === "deactivated") {
    return NextResponse.json({ error: "Club is already deactivated" }, { status: 400 });
  }

  club.status = "deactivated";
  club.deactivatedAt = new Date();
  club.deactivatedBy = session.user?.username || session.user?.name || "admin";
  club.deactivationReason = reason;
  await club.save();

  return NextResponse.json({
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
