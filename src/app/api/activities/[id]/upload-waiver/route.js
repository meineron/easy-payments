import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import mammoth from "mammoth";

export async function POST(request, { params }) {
  try {
    const session = await getServerSession(authOptions);
    if (!session || session.user.role !== "club") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

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
