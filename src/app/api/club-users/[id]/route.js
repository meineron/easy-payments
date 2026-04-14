import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import dbConnect from "@/lib/mongodb";
import ClubUser from "@/models/ClubUser";

export async function GET(request, { params }) {
  try {
    const session = await getServerSession(authOptions);
    if (!session || session.user.role !== "club") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    await dbConnect();
    const { id } = await params;

    const user = await ClubUser.findOne({ _id: id, clubId: session.user.id })
      .select("-password -temporaryPassword")
      .populate("teams.teamId", "name season")
      .lean();

    if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 });

    return NextResponse.json({ user });
  } catch (error) {
    console.error("Get club user error:", error);
    return NextResponse.json({ error: "Failed to get user" }, { status: 500 });
  }
}

export async function PUT(request, { params }) {
  try {
    const session = await getServerSession(authOptions);
    if (!session || session.user.role !== "club") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    await dbConnect();
    const { id } = await params;

    const user = await ClubUser.findOne({ _id: id, clubId: session.user.id });
    if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 });

    const body = await request.json();

    if (body.firstName !== undefined) user.firstName = body.firstName.trim();
    if (body.lastName !== undefined) user.lastName = body.lastName.trim();
    if (body.email !== undefined) user.email = body.email.trim().toLowerCase();
    if (body.phonePrefix !== undefined) user.phonePrefix = body.phonePrefix;
    if (body.phone !== undefined) user.phone = body.phone;
    if (body.mainRole !== undefined) {
      user.mainRole = body.mainRole;
      user.customRoleLabel = body.mainRole === "custom" ? (body.customRoleLabel || "").trim() : "";
    }
    if (body.language !== undefined) user.language = body.language;
    if (body.teams !== undefined) {
      user.teams = body.teams.map((t) => ({ teamId: t.teamId, role: t.role }));
    }

    await user.save();
    return NextResponse.json({ user });
  } catch (error) {
    console.error("Update club user error:", error);
    return NextResponse.json({ error: "Failed to update user" }, { status: 500 });
  }
}

export async function DELETE(request, { params }) {
  try {
    const session = await getServerSession(authOptions);
    if (!session || session.user.role !== "club") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    await dbConnect();
    const { id } = await params;

    const result = await ClubUser.deleteOne({ _id: id, clubId: session.user.id });
    if (result.deletedCount === 0) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Delete club user error:", error);
    return NextResponse.json({ error: "Failed to delete user" }, { status: 500 });
  }
}
