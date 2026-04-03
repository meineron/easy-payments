import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import dbConnect from "@/lib/mongodb";
import Parent from "@/models/Parent";
import Club from "@/models/Club";
import { sendParentInvite } from "@/lib/email";
import crypto from "crypto";

export async function POST(request, { params }) {
  try {
    const session = await getServerSession(authOptions);
    if (!session || session.user.role !== "club") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const { id } = await params;
    await dbConnect();

    const parent = await Parent.findOne({ _id: id, clubId: session.user.id });
    if (!parent) {
      return NextResponse.json({ error: "Parent not found" }, { status: 404 });
    }

    const token = crypto.randomUUID();
    parent.inviteToken = token;
    parent.invitedAt = new Date();
    await parent.save();

    const club = await Club.findById(session.user.id, "name logoUrl").lean();
    const baseUrl = process.env.NEXTAUTH_URL || "http://localhost:3000";
    const inviteUrl = `${baseUrl}/parent/login?invite=${token}`;

    await sendParentInvite(parent.email, {
      parentName: parent.firstName,
      clubName: club?.name || "Your Club",
      inviteUrl,
      logoUrl: club?.logoUrl || null,
    });

    return NextResponse.json({ success: true, invitedAt: parent.invitedAt });
  } catch (error) {
    console.error("Send parent invite error:", error);
    return NextResponse.json({ error: "Failed to send invite" }, { status: 500 });
  }
}
