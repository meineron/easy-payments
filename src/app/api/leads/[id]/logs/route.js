import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import dbConnect from "@/lib/mongodb";
import Lead from "@/models/Lead";
import LeadLog from "@/models/LeadLog";

export async function GET(request, { params }) {
  try {
    const session = await getServerSession(authOptions);
    if (!session || session.user.role !== "club") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;
    await dbConnect();

    const lead = await Lead.findOne({ _id: id, clubId: session.user.id }).select("_id").lean();
    if (!lead) {
      return NextResponse.json({ error: "Lead not found" }, { status: 404 });
    }

    const { searchParams } = new URL(request.url);
    const type = searchParams.get("type");

    const filter = { leadId: id, clubId: session.user.id };
    if (type) filter.type = type;

    const logs = await LeadLog.find(filter).sort({ createdAt: -1 }).limit(500).lean();
    return NextResponse.json({ logs });
  } catch (error) {
    console.error("Get lead logs error:", error);
    return NextResponse.json({ error: "Failed to load logs" }, { status: 500 });
  }
}
