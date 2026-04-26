import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { connectMain } from "@/lib/mongodb";
import Exercise from "@/models/Exercise";

// Exercises live in the main DB and are scoped to the global `User`, so they
// follow the user across every club they switch into.
//
// GET  /api/exercises          → list current user's exercises (private + shared owned)
// POST /api/exercises          → create a new exercise

function requireUser(session) {
  const userId = session?.user?.userId;
  if (!userId) return null;
  return userId;
}

export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    const userId = requireUser(session);
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    await connectMain();
    const exercises = await Exercise.find({ ownerUserId: userId })
      .sort({ updatedAt: -1 })
      .lean();
    return NextResponse.json({ exercises });
  } catch (err) {
    console.error("[exercises GET]", err);
    return NextResponse.json({ error: "Failed to load exercises" }, { status: 500 });
  }
}

export async function POST(request) {
  try {
    const session = await getServerSession(authOptions);
    const userId = requireUser(session);
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const body = await request.json();
    const title = (body?.title || "").trim();
    if (!title) {
      return NextResponse.json({ error: "Title is required" }, { status: 400 });
    }
    await connectMain();
    const exercise = await Exercise.create({
      ownerUserId: userId,
      title,
      description: (body.description || "").trim(),
      contentHtml: body.contentHtml || "",
      tags: Array.isArray(body.tags) ? body.tags.map((t) => String(t).trim()).filter(Boolean) : [],
      visibility: body.visibility === "shared" ? "shared" : "private",
    });
    return NextResponse.json({ exercise }, { status: 201 });
  } catch (err) {
    console.error("[exercises POST]", err);
    return NextResponse.json({ error: "Failed to create exercise" }, { status: 500 });
  }
}
