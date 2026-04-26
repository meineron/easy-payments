import { NextResponse } from "next/server";
import { connectMain } from "@/lib/mongodb";
import { resolvePublicContext } from "@/lib/club-context";
import Club from "@/models/Club";

export async function GET(request, { params }) {
  try {
    const { slug } = await params;

    const ctx = await resolvePublicContext("leadSlug", slug);
    if (!ctx) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const lead = await ctx.models.Lead.findOne({ slug }).lean();
    if (!lead) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    if (lead.status !== "enabled") {
      return NextResponse.json({ error: "Unavailable", reason: "disabled" }, { status: 404 });
    }
    if (lead.expiresAt && new Date(lead.expiresAt) < new Date()) {
      return NextResponse.json({ error: "Expired", reason: "expired" }, { status: 404 });
    }

    await connectMain();
    const club = await Club.findById(lead.clubId).select("name logoUrl language").lean();

    const safeLead = {
      _id: lead._id,
      slug: lead.slug,
      title: lead.title,
      description: lead.description,
      coverImage: lead.coverImage,
      expiresAt: lead.expiresAt,
      formSections: lead.formSections,
    };

    return NextResponse.json({
      lead: safeLead,
      club: club ? { name: club.name, logoUrl: club.logoUrl, language: club.language || "en" } : null,
    });
  } catch (error) {
    console.error("Public get lead error:", error);
    return NextResponse.json({ error: "Failed to load lead" }, { status: 500 });
  }
}
