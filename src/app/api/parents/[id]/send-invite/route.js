import { NextResponse } from "next/server";
import crypto from "crypto";
import { connectMain } from "@/lib/mongodb";
import { getClubContext, dualSave } from "@/lib/club-context";
import Club from "@/models/Club";
import { sendParentInvite } from "@/lib/email";

export async function POST(request, { params }) {
  try {
    const { ctx, error } = await getClubContext();
    if (error) return NextResponse.json(error.body, { status: error.status });
    const { Parent } = ctx.models;

    const { id } = await params;
    const parent = await Parent.findOne({ _id: id, clubId: ctx.clubId });
    if (!parent) {
      return NextResponse.json({ error: "Parent not found" }, { status: 404 });
    }

    const token = crypto.randomUUID();
    parent.inviteToken = token;
    parent.invitedAt = new Date();
    await dualSave(ctx, parent);

    await connectMain();
    const club = await Club.findById(ctx.clubId, "name logoUrl language").lean();
    const baseUrl = process.env.NEXTAUTH_URL || "http://localhost:3000";
    const inviteUrl = `${baseUrl}/parent/login?invite=${token}`;

    await sendParentInvite(parent.email, {
      parentName: parent.firstName,
      clubName: club?.name || "Your Club",
      inviteUrl,
      logoUrl: club?.logoUrl || null,
      locale: club?.language || "en",
    });

    return NextResponse.json({ success: true, invitedAt: parent.invitedAt });
  } catch (error) {
    console.error("Send parent invite error:", error);
    return NextResponse.json({ error: "Failed to send invite" }, { status: 500 });
  }
}
