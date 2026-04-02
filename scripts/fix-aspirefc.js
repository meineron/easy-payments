/**
 * Fix aspirefc club state.
 * 
 * The Mongoose model caching bug caused hasDirectStripeAccess to not persist
 * while onboardingComplete was set to true. This script resets the club
 * so it can be properly edited again.
 * 
 * Run:  node scripts/fix-aspirefc.js
 */

import mongoose from "mongoose";
import { config } from "dotenv";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(__dirname, "../.env.local") });

const MONGODB_URI = process.env.MONGODB_URI;

if (!MONGODB_URI) {
  console.error("ERROR: MONGODB_URI not found in .env.local");
  process.exit(1);
}

async function fix() {
  console.log("Connecting to MongoDB...");
  await mongoose.connect(MONGODB_URI);
  const db = mongoose.connection.db;
  const clubs = db.collection("clubs");

  const club = await clubs.findOne({ username: "aspirefc" });

  if (!club) {
    console.log("Club 'aspirefc' not found.");
    await mongoose.disconnect();
    return;
  }

  console.log("\nCurrent state of aspirefc:");
  console.log("  onboardingComplete:", club.onboardingComplete);
  console.log("  hasDirectStripeAccess:", club.hasDirectStripeAccess);
  console.log("  stripeAccountId:", club.stripeAccountId);
  console.log("  stripeSecretKey:", club.stripeSecretKey ? "(set)" : "(not set)");

  const result = await clubs.updateOne(
    { username: "aspirefc" },
    {
      $set: {
        onboardingComplete: false,
        hasDirectStripeAccess: false,
        stripeSecretKey: null,
      },
    }
  );

  console.log("\nReset aspirefc:");
  console.log("  onboardingComplete → false");
  console.log("  hasDirectStripeAccess → false");
  console.log("  stripeSecretKey → null");
  console.log("  Modified count:", result.modifiedCount);
  console.log("\nYou can now edit aspirefc from the admin panel and set the correct Stripe access type.");

  await mongoose.disconnect();
}

fix().catch((err) => {
  console.error("Fix failed:", err);
  process.exit(1);
});
