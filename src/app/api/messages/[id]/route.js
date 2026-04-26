import { NextResponse } from "next/server";
import { getClubContext } from "@/lib/club-context";

export async function GET(request, { params }) {
  try {
    const { ctx, error } = await getClubContext();
    if (error) return NextResponse.json(error.body, { status: error.status });
    const { Message } = ctx.models;

    const { id } = await params;
    const message = await Message.findById(id).lean();
    if (!message) {
      return NextResponse.json({ error: "Message not found" }, { status: 404 });
    }
    if (String(message.clubId) !== String(ctx.clubId)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    }

    return NextResponse.json({ message });
  } catch (error) {
    console.error("Get message error:", error);
    return NextResponse.json({ error: "Failed to load message" }, { status: 500 });
  }
}
