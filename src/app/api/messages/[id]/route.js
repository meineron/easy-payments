import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import dbConnect from "@/lib/mongodb";
import Message from "@/models/Message";

export async function GET(request, { params }) {
  try {
    const session = await getServerSession(authOptions);
    if (!session || session.user.role !== "club") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    await dbConnect();

    const { id } = await params;
    const message = await Message.findById(id).lean();
    if (!message) {
      return NextResponse.json({ error: "Message not found" }, { status: 404 });
    }
    if (String(message.clubId) !== session.user.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    }

    return NextResponse.json({ message });
  } catch (error) {
    console.error("Get message error:", error);
    return NextResponse.json({ error: "Failed to load message" }, { status: 500 });
  }
}
