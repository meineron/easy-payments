import { NextResponse } from "next/server";
import mongoose from "mongoose";
import bcrypt from "bcryptjs";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import dbConnect, { connectMain } from "@/lib/mongodb";
import { stripe } from "@/lib/stripe";
import { generateClubDbName } from "@/lib/club-db-name";
import Club from "@/models/Club";

async function requireAdmin() {
  const session = await getServerSession(authOptions);
  if (!session || session.user?.role !== "admin") {
    return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  }
  return { session };
}

export async function GET(request) {
  const { error } = await requireAdmin();
  if (error) return error;

  const { searchParams } = new URL(request.url);
  const statusParam = (searchParams.get("status") || "active").toLowerCase();

  const filter = {};
  if (statusParam === "deactivated") {
    filter.status = "deactivated";
  } else if (statusParam === "active") {
    // Treat clubs without an explicit status as active (pre-backfill).
    filter.$or = [{ status: "active" }, { status: { $exists: false } }];
  } // "all" → no filter

  await dbConnect();
  const clubs = await Club.find(filter)
    .select("-password -stripeSecretKey -stripeWebhookSecret -smtpPassword")
    .sort({ createdAt: -1 });
  return NextResponse.json({ clubs });
}

export async function POST(request) {
  const { error } = await requireAdmin();
  if (error) return error;

  try {
    const { name, username, password, hasDirectStripeAccess, stripeSecretKey, stripeWebhookSecret } = await request.json();

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

    // Pre-allocate the _id so we can derive a slug-based `dbName` (and pass
    // it to Stripe metadata) before persisting.
    const _id = new mongoose.Types.ObjectId();
    const mainConn = await connectMain();
    const dbName = await generateClubDbName({ name, _id, mainConn });

    const clubData = {
      _id,
      name,
      username: username.toLowerCase(),
      password: hashedPassword,
      hasDirectStripeAccess: !!hasDirectStripeAccess,
      dbName,
    };

    if (hasDirectStripeAccess) {
      clubData.stripeSecretKey = stripeSecretKey;
      if (typeof stripeWebhookSecret === "string" && stripeWebhookSecret.trim()) {
        clubData.stripeWebhookSecret = stripeWebhookSecret.trim();
      }
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
        dbName: club.dbName,
      },
    }, { status: 201 });
  } catch (error) {
    console.error("Create club error:", error);
    return NextResponse.json({ error: "Failed to create club" }, { status: 500 });
  }
}
