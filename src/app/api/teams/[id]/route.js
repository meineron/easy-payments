import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import dbConnect from "@/lib/mongodb";
import Team from "@/models/Team";

export async function GET(request, { params }) {
  try {
    const session = await getServerSession(authOptions);
    if (!session || session.user.role !== "club") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;
    await dbConnect();
    const team = await Team.findOne({ _id: id, clubId: session.user.id });

    if (!team) {
      return NextResponse.json({ error: "Team not found" }, { status: 404 });
    }

    return NextResponse.json({ team });
  } catch (error) {
    console.error("Get team error:", error);
    return NextResponse.json({ error: "Failed to get team" }, { status: 500 });
  }
}

export async function PUT(request, { params }) {
  try {
    const session = await getServerSession(authOptions);
    if (!session || session.user.role !== "club") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;
    const { name, season, gender, teamType, costDollars, loyaltyDiscountDollars, activityStartDate } = await request.json();

    const updates = {};
    if (name) updates.name = name.trim();
    if (season) updates.season = season;
    if (teamType !== undefined) updates.teamType = teamType.trim();
    if (gender !== undefined) {
      if (gender && !["Male", "Female", ""].includes(gender)) {
        return NextResponse.json({ error: "Gender must be Male or Female" }, { status: 400 });
      }
      updates.gender = gender;
    }
    if (costDollars !== undefined) {
      const costCents = Math.round(parseFloat(costDollars) * 100);
      updates.costCents = Math.max(costCents, 0);
    }
    if (loyaltyDiscountDollars !== undefined) {
      updates.loyaltyDiscountCents = Math.max(Math.round(parseFloat(loyaltyDiscountDollars) * 100) || 0, 0);
    }
    if (activityStartDate) {
      const startDate = new Date(activityStartDate);
      if (isNaN(startDate.getTime())) {
        return NextResponse.json({ error: "Invalid activity start date" }, { status: 400 });
      }
      updates.activityStartDate = startDate;
    }

    await dbConnect();
    const team = await Team.findOneAndUpdate(
      { _id: id, clubId: session.user.id },
      updates,
      { new: true }
    );

    if (!team) {
      return NextResponse.json({ error: "Team not found" }, { status: 404 });
    }

    return NextResponse.json({ team });
  } catch (error) {
    console.error("Update team error:", error);
    return NextResponse.json({ error: "Failed to update team" }, { status: 500 });
  }
}

export async function DELETE(request, { params }) {
  try {
    const session = await getServerSession(authOptions);
    if (!session || session.user.role !== "club") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;
    await dbConnect();
    const team = await Team.findOneAndDelete({ _id: id, clubId: session.user.id });

    if (!team) {
      return NextResponse.json({ error: "Team not found" }, { status: 404 });
    }

    return NextResponse.json({ message: "Team deleted" });
  } catch (error) {
    console.error("Delete team error:", error);
    return NextResponse.json({ error: "Failed to delete team" }, { status: 500 });
  }
}
