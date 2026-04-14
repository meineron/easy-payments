import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import dbConnect from "@/lib/mongodb";
import Parent from "@/models/Parent";
import Player from "@/models/Player";

export async function GET(request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session || session.user.role !== "club") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    await dbConnect();
    void Player;

    const { searchParams } = new URL(request.url);
    const search = searchParams.get("search")?.trim();

    const query = { clubId: session.user.id };
    if (search) {
      const escaped = search.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const re = { $regex: escaped, $options: "i" };
      query.$or = [
        { firstName: re },
        { lastName: re },
        { email: re },
        { phone: re },
      ];
    }

    const parents = await Parent.find(query)
      .populate("players", "firstName lastName dateOfBirth gender primaryPosition")
      .sort({ createdAt: -1 })
      .limit(search ? 20 : 0);

    return NextResponse.json({ parents });
  } catch (error) {
    console.error("List parents error:", error);
    return NextResponse.json({ error: "Failed to list parents" }, { status: 500 });
  }
}

export async function POST(request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session || session.user.role !== "club") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { firstName, lastName, email, phonePrefix, phone } = await request.json();

    if (!firstName || !lastName || !email || !phone) {
      return NextResponse.json({ error: "First name, last name, email, and phone are required" }, { status: 400 });
    }

    await dbConnect();
    const parent = await Parent.create({
      clubId: session.user.id,
      firstName: firstName.trim(),
      lastName: lastName.trim(),
      email: email.trim(),
      phonePrefix: (phonePrefix || "+1").trim(),
      phone: phone.trim(),
      players: [],
    });

    return NextResponse.json({ parent }, { status: 201 });
  } catch (error) {
    if (error.code === 11000) {
      return NextResponse.json({ error: "A parent with this email already exists" }, { status: 409 });
    }
    console.error("Create parent error:", error);
    return NextResponse.json({ error: "Failed to create parent" }, { status: 500 });
  }
}
