import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import mongoose from "mongoose";
import { authOptions } from "@/lib/auth";
import { connectMain } from "@/lib/mongodb";
import Exercise from "@/models/Exercise";

// Per-exercise CRUD scoped to the global `User`. Only the owner may read or
// mutate (visibility=shared is read-only by other users via a future
// listing/search route — not implemented here yet to keep the surface small).

function isObjectId(v) {
  return mongoose.Types.ObjectId.isValid(String(v));
}

async function loadOwned(id, userId) {
  if (!isObjectId(id)) return null;
  await connectMain();
  return Exercise.findOne({ _id: id, ownerUserId: userId });
}

export async function GET(_request, { params }) {
  const session = await getServerSession(authOptions);
  const userId = session?.user?.userId;
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const exercise = await loadOwned(id, userId);
  if (!exercise) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ exercise });
}

export async function PUT(request, { params }) {
  const session = await getServerSession(authOptions);
  const userId = session?.user?.userId;
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const exercise = await loadOwned(id, userId);
  if (!exercise) return NextResponse.json({ error: "Not found" }, { status: 404 });

  try {
    const body = await request.json();
    if (typeof body.title === "string") {
      const t = body.title.trim();
      if (!t) return NextResponse.json({ error: "Title is required" }, { status: 400 });
      exercise.title = t;
    }
    if (typeof body.description === "string") exercise.description = body.description.trim();
    if (typeof body.contentHtml === "string") exercise.contentHtml = body.contentHtml;
    if (Array.isArray(body.tags)) {
      exercise.tags = body.tags.map((t) => String(t).trim()).filter(Boolean);
    }
    if (body.visibility === "private" || body.visibility === "shared") {
      exercise.visibility = body.visibility;
    }
    await exercise.save();
    return NextResponse.json({ exercise });
  } catch (err) {
    console.error("[exercises PUT]", err);
    return NextResponse.json({ error: "Failed to update exercise" }, { status: 500 });
  }
}

export async function DELETE(_request, { params }) {
  const session = await getServerSession(authOptions);
  const userId = session?.user?.userId;
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  if (!isObjectId(id)) return NextResponse.json({ error: "Not found" }, { status: 404 });

  await connectMain();
  const result = await Exercise.deleteOne({ _id: id, ownerUserId: userId });
  if (result.deletedCount === 0) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  return NextResponse.json({ ok: true });
}
