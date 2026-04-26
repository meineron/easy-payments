import { NextResponse } from "next/server";
import { getClubContext, dualCreate } from "@/lib/club-context";

export async function GET(request) {
  try {
    const { ctx, error } = await getClubContext();
    if (error) return NextResponse.json(error.body, { status: error.status });
    const { Parent, Player } = ctx.models;
    void Player;

    const { searchParams } = new URL(request.url);
    const search = searchParams.get("search")?.trim();

    const query = { clubId: ctx.clubId };
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
    const { ctx, error } = await getClubContext();
    if (error) return NextResponse.json(error.body, { status: error.status });

    const { firstName, lastName, email, phonePrefix, phone } = await request.json();

    if (!firstName || !lastName || !email || !phone) {
      return NextResponse.json({ error: "First name, last name, email, and phone are required" }, { status: 400 });
    }

    const parent = await dualCreate(ctx, "Parent", {
      clubId: ctx.clubId,
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
