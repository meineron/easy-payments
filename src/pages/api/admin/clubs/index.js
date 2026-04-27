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
    return { error: res.status(401).json({ error: "Unauthorized" }) };
  }
  return { session };
}

async function _GET(req, res) {
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
  return res.status(200).json({ clubs });
}

async function _POST(req, res) {
  const { error } = await requireAdmin();
  if (error) return error;

  try {
    const { name, username, password, hasDirectStripeAccess, stripeSecretKey, stripeWebhookSecret } = req.body;

    if (!name || !username || !password) {
      return res.status(400).json({ error: "All fields are required" });
    }

    if (password.length < 6) {
      return res.status(400).json({ error: "Password must be at least 6 characters" });
    }

    if (hasDirectStripeAccess && !stripeSecretKey) {
      return res.status(400).json({ error: "Stripe secret key is required when direct access is enabled" });
    }

    await dbConnect();

    const existing = await Club.findOne({ username: username.toLowerCase() });
    if (existing) {
      return res.status(400).json({ error: "Username already exists" });
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

    return res.status(200).json({
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
    return res.status(500).json({ error: "Failed to create club" });
  }
}
export default async function handler(req, res) {
  if (req.method === "GET") {
    return _GET(req, res);
  } else if (req.method === "POST") {
    return _POST(req, res);
  } else {
    return res.status(405).json({ error: "Method not allowed" });
  }
}
