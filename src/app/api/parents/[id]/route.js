import { NextResponse } from "next/server";
import { getClubContext, dualWrite } from "@/lib/club-context";

export async function GET(request, { params }) {
  try {
    const { ctx, error } = await getClubContext();
    if (error) return NextResponse.json(error.body, { status: error.status });
    const { Parent, Player } = ctx.models;
    void Player;

    const { id } = await params;

    const parent = await Parent.findOne({ _id: id, clubId: ctx.clubId })
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
    const { ctx, error } = await getClubContext();
    if (error) return NextResponse.json(error.body, { status: error.status });
    void ctx.models.Player;

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

    const parent = await dualWrite(ctx, (M) => M.Parent.findOneAndUpdate(
      { _id: id, clubId: ctx.clubId },
      updates,
      { new: true },
    ));

    if (!parent) {
      return NextResponse.json({ error: "Parent not found" }, { status: 404 });
    }

    const populated = await ctx.models.Parent.findById(parent._id)
      .populate("players", "firstName lastName dateOfBirth gender primaryPosition school email phoneNumber");

    return NextResponse.json({ parent: populated });
  } catch (error) {
    console.error("Update parent error:", error);
    return NextResponse.json({ error: "Failed to update parent" }, { status: 500 });
  }
}

export async function DELETE(request, { params }) {
  try {
    const { ctx, error } = await getClubContext();
    if (error) return NextResponse.json(error.body, { status: error.status });

    const { id } = await params;

    const parent = await dualWrite(ctx, (M) => M.Parent.findOneAndDelete({ _id: id, clubId: ctx.clubId }));
    if (!parent) {
      return NextResponse.json({ error: "Parent not found" }, { status: 404 });
    }

    await dualWrite(ctx, (M) => M.Player.updateMany(
      { clubId: ctx.clubId, parents: parent._id },
      { $pull: { parents: parent._id } },
    ));

    return NextResponse.json({ message: "Parent deleted" });
  } catch (error) {
    console.error("Delete parent error:", error);
    return NextResponse.json({ error: "Failed to delete parent" }, { status: 500 });
  }
}
