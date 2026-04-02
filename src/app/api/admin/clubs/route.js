import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import dbConnect from "@/lib/mongodb";
import { stripe } from "@/lib/stripe";
import Club from "@/models/Club";

export async function GET() {
  await dbConnect();
  const clubs = await Club.find({}).select("-password -stripeSecretKey").sort({ createdAt: -1 });
  return NextResponse.json({ clubs });
}

export async function POST(request) {
  try {
    const { name, username, password, hasDirectStripeAccess, stripeSecretKey } = await request.json();

    if (!name || !username || !password) {
      return NextResponse.json({ error: "All fields are required" }, { status: 400 });
    }

    if (password.length < 6) {
      return NextResponse.json({ error: "Password must be at least 6 characters" }, { status: 400 });
    }

    if (hasDirectStripeAccess && !stripeSecretKey) {
      return NextResponse.json({ error: "Stripe secret key is required when direct access is enabled" }, { status: 400 });
    }

    await dbConnect();

    const existing = await Club.findOne({ username: username.toLowerCase() });
    if (existing) {
      return NextResponse.json({ error: "Username already exists" }, { status: 400 });
    }

    const hashedPassword = await bcrypt.hash(password, 12);

    const clubData = {
      name,
      username: username.toLowerCase(),
      password: hashedPassword,
      hasDirectStripeAccess: !!hasDirectStripeAccess,
    };

    if (hasDirectStripeAccess) {
      clubData.stripeSecretKey = stripeSecretKey;
      clubData.onboardingComplete = true;
    } else {
      const account = await stripe.accounts.create({
        type: "express",
        metadata: { clubName: name },
      });
      clubData.stripeAccountId = account.id;
    }

    const club = await Club.create(clubData);

    return NextResponse.json({
      club: {
        _id: club._id,
        name: club.name,
        username: club.username,
        stripeAccountId: club.stripeAccountId,
        hasDirectStripeAccess: club.hasDirectStripeAccess,
      },
    }, { status: 201 });
  } catch (error) {
    console.error("Create club error:", error);
    return NextResponse.json({ error: "Failed to create club" }, { status: 500 });
  }
}
