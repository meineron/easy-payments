import { NextResponse } from "next/server";
import mammoth from "mammoth";
import { getClubContext } from "@/lib/club-context";

export async function POST(request) {
  try {
    const { error } = await getClubContext();
    if (error) return NextResponse.json(error.body, { status: error.status });

    const formData = await request.formData();
    const file = formData.get("file");
    if (!file) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const result = await mammoth.convertToHtml({ buffer });
    const html = result.value;
    const title = file.name.replace(/\.[^/.]+$/, "");

    return NextResponse.json({ html, title, warnings: result.messages });
  } catch (error) {
    console.error("Upload waiver error:", error);
    return NextResponse.json({ error: "Failed to convert document" }, { status: 500 });
  }
}
