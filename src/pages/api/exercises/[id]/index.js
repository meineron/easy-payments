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

async function _GET(req, res) {
  const session = await getServerSession(authOptions);
  const userId = session?.user?.userId;
  if (!userId) return res.status(401).json({ error: "Unauthorized" });

  const { id } = req.query;
  const exercise = await loadOwned(id, userId);
  if (!exercise) return res.status(404).json({ error: "Not found" });
  return res.status(200).json({ exercise });
}

async function _PUT(req, res) {
  const session = await getServerSession(authOptions);
  const userId = session?.user?.userId;
  if (!userId) return res.status(401).json({ error: "Unauthorized" });

  const { id } = req.query;
  const exercise = await loadOwned(id, userId);
  if (!exercise) return res.status(404).json({ error: "Not found" });

  try {
    const body = req.body;
    if (typeof body.title === "string") {
      const t = body.title.trim();
      if (!t) return res.status(400).json({ error: "Title is required" });
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
    return res.status(200).json({ exercise });
  } catch (err) {
    console.error("[exercises PUT]", err);
    return res.status(500).json({ error: "Failed to update exercise" });
  }
}

async function _DELETE(req, res) {
  const session = await getServerSession(authOptions);
  const userId = session?.user?.userId;
  if (!userId) return res.status(401).json({ error: "Unauthorized" });

  const { id } = req.query;
  if (!isObjectId(id)) return res.status(404).json({ error: "Not found" });

  await connectMain();
  const result = await Exercise.deleteOne({ _id: id, ownerUserId: userId });
  if (result.deletedCount === 0) {
    return res.status(404).json({ error: "Not found" });
  }
  return res.status(200).json({ ok: true });
}
export default async function handler(req, res) {
  if (req.method === "GET") {
    return _GET(req, res);
  } else if (req.method === "PUT") {
    return _PUT(req, res);
  } else if (req.method === "DELETE") {
    return _DELETE(req, res);
  } else {
    return res.status(405).json({ error: "Method not allowed" });
  }
}
