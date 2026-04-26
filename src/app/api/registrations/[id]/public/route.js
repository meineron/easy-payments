import { NextResponse } from "next/server";
import { connectMain } from "@/lib/mongodb";
import { resolvePublicContext } from "@/lib/club-context";
import Club from "@/models/Club";

export async function GET(request, { params }) {
  try {
    const { id } = await params;

    const ctx = await resolvePublicContext("registration", id);
    if (!ctx) {
      return NextResponse.json({ error: "Registration not found" }, { status: 404 });
    }
    const { Registration, Team } = ctx.models;

    const reg = await Registration.findById(id);
    if (!reg) {
      return NextResponse.json({ error: "Registration not found" }, { status: 404 });
    }

    if (reg.status === "completed" || reg.status === "active") {
      return NextResponse.json({ error: "This registration is already paid" }, { status: 400 });
    }

    const team = await Team.findById(reg.teamId);
    await connectMain();
    const club = await Club.findById(reg.clubId).select("name");

    return NextResponse.json({
      registration: {
        _id: reg._id,
        parentFirstName: reg.parentFirstName,
        parentLastName: reg.parentLastName,
        parentEmail: reg.parentEmail,
        playerFirstName: reg.playerFirstName,
        playerLastName: reg.playerLastName,
        subscriptionCostCents: reg.subscriptionCostCents,
        discountCents: reg.discountCents,
        finalCostCents: reg.finalCostCents,
        hasLoyaltyDiscount: reg.hasLoyaltyDiscount,
        numPayments: reg.numPayments,
        status: reg.status,
      },
      team: team ? {
        _id: team._id,
        name: team.name,
        season: team.season,
        costCents: team.costCents,
        activityStartDate: team.activityStartDate,
      } : null,
      clubName: club?.name || "",
    });
  } catch (error) {
    console.error("Public registration fetch error:", error);
    return NextResponse.json({ error: "Failed to load registration" }, { status: 500 });
  }
}
