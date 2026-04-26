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

// POST /api/admin/clubs/:id/reactivate  → restore a soft-deleted club.
export async function POST(request, { params }) {
  const { error } = await requireAdmin();
  if (error) return error;

  const { id } = await params;

  await dbConnect();
  const club = await Club.findById(id);
  if (!club) {
    return NextResponse.json({ error: "Club not found" }, { status: 404 });
  }

  if (club.status !== "deactivated") {
    return NextResponse.json({ error: "Club is not deactivated" }, { status: 400 });
  }

  club.status = "active";
  club.deactivatedAt = null;
  club.deactivatedBy = null;
  club.deactivationReason = "";
  await club.save();

  return NextResponse.json({
    club: {
      _id: club._id,
      name: club.name,
      status: club.status,
    },
  });
}
