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

async function _GET(req, res) {
  try {
    const session = await getServerSession(authOptions);
    const userId = requireUser(session);
    if (!userId) {
      return res.status(401).json({ error: "Unauthorized" });
    }
    await connectMain();
    const exercises = await Exercise.find({ ownerUserId: userId })
      .sort({ updatedAt: -1 })
      .lean();
    return res.status(200).json({ exercises });
  } catch (err) {
    console.error("[exercises GET]", err);
    return res.status(500).json({ error: "Failed to load exercises" });
  }
}

async function _POST(req, res) {
  try {
    const session = await getServerSession(authOptions);
    const userId = requireUser(session);
    if (!userId) {
      return res.status(401).json({ error: "Unauthorized" });
    }
    const body = req.body;
    const title = (body?.title || "").trim();
    if (!title) {
      return res.status(400).json({ error: "Title is required" });
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
    return res.status(201).json({ exercise });
  } catch (err) {
    console.error("[exercises POST]", err);
    return res.status(500).json({ error: "Failed to create exercise" });
  }
}
export default async function handler(req, res) {
  if (req.method === "GET") {
    return _GET(req, res);
  } else if (req.method === "POST") {
    return _POST(req, res);
  } else {
    return res.status(405).json({ error: "Method not allowed" });
  }
}
