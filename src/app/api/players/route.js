import { NextResponse } from "next/server";
import { getClubContext, dualCreate, dualWrite } from "@/lib/club-context";
import { toDobString } from "@/lib/dob";

export async function GET(request) {
  try {
    const { ctx, error } = await getClubContext();
    if (error) return NextResponse.json(error.body, { status: error.status });
    const { Player } = ctx.models;

    const { searchParams } = new URL(request.url);
    const search = searchParams.get("search");

    let query = { clubId: ctx.clubId };
    if (search) {
      const regex = new RegExp(search, "i");
      query.$or = [
        { firstName: regex },
        { lastName: regex },
        { email: regex },
        { school: regex },
      ];
    }

    const players = await Player.find(query)
      .populate("registrationTeamId", "name season gender teamType")
      .populate("teams.teamId", "name season gender teamType")
      .populate("parents", "firstName lastName email phonePrefix phone")
      .sort({ lastName: 1, firstName: 1 });

    return NextResponse.json({ players });
  } catch (error) {
    console.error("List players error:", error);
    return NextResponse.json({ error: "Failed to list players" }, { status: 500 });
  }
}

export async function POST(request) {
  try {
    const { ctx, error } = await getClubContext();
    if (error) return NextResponse.json(error.body, { status: error.status });
    const { Player } = ctx.models;

    const body = await request.json();
    const {
      firstName, lastName, dateOfBirth, gender,
      primaryPosition, secondaryPosition, school,
      joinDate, phonePrefix, phoneNumber, address, city, state, zip, email,
      teams, parentIds, registrationTeamId,
    } = body;

    if (!firstName || !lastName) {
      return NextResponse.json({ error: "First name and last name are required" }, { status: 400 });
    }

    const playerData = {
      clubId: ctx.clubId,
      firstName: firstName.trim(),
      lastName: lastName.trim(),
      dateOfBirth: toDobString(dateOfBirth),
      gender: gender || "",
      primaryPosition: primaryPosition ? primaryPosition.trim() : "",
      secondaryPosition: secondaryPosition ? secondaryPosition.trim() : "",
      school: school ? school.trim() : "",
      joinDate: joinDate || null,
      phonePrefix: phonePrefix || "+1",
      phoneNumber: phoneNumber ? phoneNumber.trim() : "",
      address: address ? address.trim() : "",
      city: city ? city.trim() : "",
      state: state ? state.trim() : "",
      zip: zip ? zip.trim() : "",
      email: email ? email.trim().toLowerCase() : "",
      registrationTeamId: registrationTeamId || (Array.isArray(teams) && teams.length > 0 ? teams[0].teamId : null),
      teams: Array.isArray(teams) ? teams : [],
      parents: Array.isArray(parentIds) ? parentIds : [],
    };

    const player = await dualCreate(ctx, "Player", playerData);

    if (playerData.parents.length > 0) {
      await dualWrite(ctx, (M) => M.Parent.updateMany(
        { _id: { $in: playerData.parents }, clubId: ctx.clubId },
        { $addToSet: { players: player._id } },
      ));
    }

    const populated = await Player.findById(player._id)
      .populate("registrationTeamId", "name season gender teamType")
      .populate("teams.teamId", "name season gender teamType")
      .populate("parents", "firstName lastName email phonePrefix phone");

    return NextResponse.json({ player: populated }, { status: 201 });
  } catch (error) {
    if (error.code === 11000) {
      return NextResponse.json({ error: "A player with this name and date of birth already exists" }, { status: 409 });
    }
    console.error("Create player error:", error);
    return NextResponse.json({ error: "Failed to create player" }, { status: 500 });
  }
}
