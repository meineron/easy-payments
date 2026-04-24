import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import dbConnect from "@/lib/mongodb";
import Activity from "@/models/Activity";

export async function GET(request, { params }) {
  try {
    const session = await getServerSession(authOptions);
    if (!session || session.user.role !== "club") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;
    await dbConnect();

    const activity = await Activity.findOne({ _id: id, clubId: session.user.id })
      .populate("teams.teamId", "name season gender teamType year costCents");

    if (!activity) {
      return NextResponse.json({ error: "Activity not found" }, { status: 404 });
    }

    return NextResponse.json({ activity });
  } catch (error) {
    console.error("Get activity error:", error);
    return NextResponse.json({ error: "Failed to get activity" }, { status: 500 });
  }
}

export async function PUT(request, { params }) {
  try {
    const session = await getServerSession(authOptions);
    if (!session || session.user.role !== "club") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;
    const body = await request.json();
    await dbConnect();

    const activity = await Activity.findOne({ _id: id, clubId: session.user.id });
    if (!activity) {
      return NextResponse.json({ error: "Activity not found" }, { status: 404 });
    }

    const allowed = [
      "title", "coverImage", "description", "type", "season", "hasPayment",
      "startDate", "endDate", "lastRegisterDate",
      "status", "registrationType", "hiddenLink", "onlyAssignedPlayers", "playerAssignment",
      "teams", "formSections", "subscriptions", "coupons", "waivers",
      "waiverEmailConfirmation",
      "passStripeFeeToCustomer", "afterRegistrationMessage",
      "registrationInvitation",
    ];

    for (const key of allowed) {
      if (body[key] !== undefined) {
        activity[key] = body[key];
      }
    }

    await activity.save();

    const populated = await Activity.findById(activity._id)
      .populate("teams.teamId", "name season gender teamType year costCents");

    return NextResponse.json({ activity: populated });
  } catch (error) {
    console.error("Update activity error:", error);
    return NextResponse.json({ error: "Failed to update activity" }, { status: 500 });
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

    const result = await Activity.deleteOne({ _id: id, clubId: session.user.id });
    if (result.deletedCount === 0) {
      return NextResponse.json({ error: "Activity not found" }, { status: 404 });
    }

    return NextResponse.json({ message: "Activity deleted" });
  } catch (error) {
    console.error("Delete activity error:", error);
    return NextResponse.json({ error: "Failed to delete activity" }, { status: 500 });
  }
}
