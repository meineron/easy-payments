import { getClubContext } from "@/lib/club-context";

async function _GET(req, res) {
  try {
    const { ctx, error } = await getClubContext(req, res);
    if (error) return res.status(200).json(error.body, { status: error.status });
    const { Message } = ctx.models;

    const { id } = req.query;
    const message = await Message.findById(id).lean();
    if (!message) {
      return res.status(404).json({ error: "Message not found" });
    }
    if (String(message.clubId) !== String(ctx.clubId)) {
      return res.status(403).json({ error: "Unauthorized" });
    }

    return res.status(200).json({ message });
  } catch (error) {
    console.error("Get message error:", error);
    return res.status(500).json({ error: "Failed to load message" });
  }
}
export default async function handler(req, res) {
  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });
  return _GET(req, res);
}
