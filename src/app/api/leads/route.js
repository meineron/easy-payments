import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import mongoose from "mongoose";
import { authOptions } from "@/lib/auth";
import dbConnect from "@/lib/mongodb";
import Lead from "@/models/Lead";
import LeadSubmission from "@/models/LeadSubmission";
import { generateUniqueLeadSlug } from "@/lib/lead-slug";
import { defaultLeadFormSections } from "@/lib/lead-defaults";

export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session || session.user.role !== "club") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    await dbConnect();

    const leads = await Lead.find({ clubId: session.user.id })
      .select("title slug status expiresAt coverImage createdAt")
      .sort({ createdAt: -1 })
      .lean();

    const leadIds = leads.map((l) => l._id);
    const counts = leadIds.length
      ? await LeadSubmission.aggregate([
          { $match: { leadId: { $in: leadIds }, clubId: new mongoose.Types.ObjectId(session.user.id) } },
          { $group: { _id: "$leadId", count: { $sum: 1 } } },
        ]).catch(() => [])
      : [];

    const countMap = Object.fromEntries(counts.map((c) => [String(c._id), c.count]));
    const enriched = leads.map((l) => ({
      ...l,
      submissionCount: countMap[String(l._id)] || 0,
    }));

    return NextResponse.json({ leads: enriched });
  } catch (error) {
    console.error("List leads error:", error);
    return NextResponse.json({ error: "Failed to list leads" }, { status: 500 });
  }
}

export async function POST(request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session || session.user.role !== "club") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { title } = body;

    if (!title || !title.trim()) {
      return NextResponse.json({ error: "Title is required" }, { status: 400 });
    }

    await dbConnect();

    const slug = await generateUniqueLeadSlug();

    const lead = await Lead.create({
      clubId: session.user.id,
      slug,
      title: title.trim(),
      description: body.description || "",
      coverImage: body.coverImage || "",
      expiresAt: body.expiresAt || null,
      status: "enabled",
      formSections: defaultLeadFormSections(),
      notifyStaffIds: [],
      notifyChannels: { email: true, sms: false },
    });

    return NextResponse.json({ lead }, { status: 201 });
  } catch (error) {
    console.error("Create lead error:", error);
    return NextResponse.json({ error: "Failed to create lead" }, { status: 500 });
  }
}
