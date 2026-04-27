import mammoth from "mammoth";
import { getClubContext } from "@/lib/club-context";

async function _POST(req, res) {
  try {
    const { error } = await getClubContext(req, res);
    if (error) return res.status(200).json(error.body, { status: error.status });

    const formData = req.body;
    const file = formData.get("file");
    if (!file) {
      return res.status(400).json({ error: "No file provided" });
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const result = await mammoth.convertToHtml({ buffer });
    const html = result.value;
    const title = file.name.replace(/\.[^/.]+$/, "");

    return res.status(200).json({ html, title, warnings: result.messages });
  } catch (error) {
    console.error("Upload waiver error:", error);
    return res.status(500).json({ error: "Failed to convert document" });
  }
}
export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  return _POST(req, res);
}
