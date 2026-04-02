import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import dbConnect from "@/lib/mongodb";
import Parent from "@/models/Parent";
import Player from "@/models/Player";

export async function GET(request, { params }) {
  try {
    const session = await getServerSession(authOptions);
    if (!session || session.user.role !== "club") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;
    await dbConnect();
    void Player;

    const parent = await Parent.findOne({ _id: id, clubId: session.user.id })
      .populate("players", "firstName lastName dateOfBirth gender primaryPosition school email phoneNumber");

    if (!parent) {
      return NextResponse.json({ error: "Parent not found" }, { status: 404 });
    }

    return NextResponse.json({ parent });
  } catch (error) {
    console.error("Get parent error:", error);
    return NextResponse.json({ error: "Failed to get parent" }, { status: 500 });
  }
}

export async function PUT(request, { params }) {
  try {
    const session = await getServerSession(authOptions);
    if (!session || session.user.role !== "club") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;
    const body = await request.json();

    const updates = {};
    if (body.firstName) updates.firstName = body.firstName.trim();
    if (body.lastName) updates.lastName = body.lastName.trim();
    if (body.email) updates.email = body.email.trim();
    if (body.phonePrefix !== undefined) updates.phonePrefix = body.phonePrefix.trim();
    if (body.phone) updates.phone = body.phone.trim();

    if (body.playerIds !== undefined) {
      updates.players = body.playerIds;
    }

    await dbConnect();
    void Player;

    const parent = await Parent.findOneAndUpdate(
      { _id: id, clubId: session.user.id },
      updates,
      { new: true }
    ).populate("players", "firstName lastName dateOfBirth gender primaryPosition school email phoneNumber");

    if (!parent) {
      return NextResponse.json({ error: "Parent not found" }, { status: 404 });
    }

    return NextResponse.json({ parent });
  } catch (error) {
    console.error("Update parent error:", error);
    return NextResponse.json({ error: "Failed to update parent" }, { status: 500 });
  }
}

export async function DELETE(request, { params }) {
  try {
    const session = await getServerSession(authOptions);
    if (!session || session.user.role !== "club") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;
    await dbConnect();

    const parent = await Parent.findOneAndDelete({ _id: id, clubId: session.user.id });
    if (!parent) {
      return NextResponse.json({ error: "Parent not found" }, { status: 404 });
    }

    await Player.updateMany(
      { clubId: session.user.id, parents: parent._id },
      { $pull: { parents: parent._id } }
    );

    return NextResponse.json({ message: "Parent deleted" });
  } catch (error) {
    console.error("Delete parent error:", error);
    return NextResponse.json({ error: "Failed to delete parent" }, { status: 500 });
  }
}
