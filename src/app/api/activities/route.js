import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import dbConnect from "@/lib/mongodb";
import Activity from "@/models/Activity";

function defaultFormSections() {
  return [
    {
      key: "player_details",
      title: "Player Information",
      order: 0,
      isDefault: true,
      fields: [
        { key: "player_firstName", type: "input", label: "First Name", required: true, hidden: false, isDefault: true, isMust: true, order: 0, options: [] },
        { key: "player_lastName", type: "input", label: "Last Name", required: true, hidden: false, isDefault: true, isMust: true, order: 1, options: [] },
        { key: "player_gender", type: "dropdown_single", label: "Gender", required: true, hidden: false, isDefault: true, isMust: true, order: 2, options: ["Male", "Female"] },
        { key: "player_dob", type: "date", label: "Date of Birth", required: true, hidden: false, isDefault: true, isMust: true, order: 3, options: [] },
        { key: "player_phone", type: "phone", label: "Phone Number", required: false, hidden: false, isDefault: true, isMust: false, order: 4, options: [] },
        { key: "player_email", type: "email", label: "Email", required: false, hidden: false, isDefault: true, isMust: false, order: 5, options: [] },
        { key: "player_address", type: "address", label: "Address", required: true, hidden: false, isDefault: true, isMust: false, order: 6, options: [] },
      ],
    },
    {
      key: "parents_details",
      title: "Parents Details",
      order: 1,
      isDefault: true,
      fields: [
        { key: "parent1_firstName", type: "input", label: "Parent 1 - First Name", required: true, hidden: false, isDefault: true, isMust: true, order: 0, options: [] },
        { key: "parent1_lastName", type: "input", label: "Parent 1 - Last Name", required: true, hidden: false, isDefault: true, isMust: true, order: 1, options: [] },
        { key: "parent1_phone", type: "phone", label: "Parent 1 - Phone", required: true, hidden: false, isDefault: true, isMust: true, order: 2, options: [] },
        { key: "parent1_email", type: "email", label: "Parent 1 - Email", required: true, hidden: false, isDefault: true, isMust: true, order: 3, options: [] },
        { key: "parent2_firstName", type: "input", label: "Parent 2 - First Name", required: false, hidden: false, isDefault: true, isMust: false, order: 4, options: [], description: "Optional — if provided, all Parent 2 fields are required" },
        { key: "parent2_lastName", type: "input", label: "Parent 2 - Last Name", required: false, hidden: false, isDefault: true, isMust: false, order: 5, options: [] },
        { key: "parent2_phone", type: "phone", label: "Parent 2 - Phone", required: false, hidden: false, isDefault: true, isMust: false, order: 6, options: [] },
        { key: "parent2_email", type: "email", label: "Parent 2 - Email", required: false, hidden: false, isDefault: true, isMust: false, order: 7, options: [] },
      ],
    },
    {
      key: "waivers",
      title: "Waivers",
      order: 2,
      isDefault: true,
      fields: [],
    },
  ];
}

export async function GET(request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session || session.user.role !== "club") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    await dbConnect();

    const activities = await Activity.find({ clubId: session.user.id })
      .select("title type season status hasPayment startDate endDate lastRegisterDate teams createdAt")
      .sort({ createdAt: -1 });

    return NextResponse.json({ activities });
  } catch (error) {
    console.error("List activities error:", error);
    return NextResponse.json({ error: "Failed to list activities" }, { status: 500 });
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

    const activity = await Activity.create({
      clubId: session.user.id,
      title: title.trim(),
      type: body.type || "Season Registration",
      season: body.season || "",
      formSections: defaultFormSections(),
    });

    return NextResponse.json({ activity }, { status: 201 });
  } catch (error) {
    console.error("Create activity error:", error);
    return NextResponse.json({ error: "Failed to create activity" }, { status: 500 });
  }
}
