/**
 * Database Setup Script
 * 
 * Run this once after setting up your .env.local with MONGODB_URI:
 *   node scripts/setup-db.js
 * 
 * It will:
 * - Create the clubs and transactions collections
 * - Set up all required indexes
 * - Print a summary
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

async function setup() {
  console.log("Connecting to MongoDB...");
  console.log(`URI: ${MONGODB_URI.replace(/\/\/.*@/, "//***@")}\n`);

  await mongoose.connect(MONGODB_URI);
  const db = mongoose.connection.db;

  const existing = await db.listCollections().toArray();
  const existingNames = existing.map((c) => c.name);

  // --- Clubs Collection ---
  if (!existingNames.includes("clubs")) {
    await db.createCollection("clubs");
    console.log("Created collection: clubs");
  } else {
    console.log("Collection already exists: clubs");
  }

  const clubsCol = db.collection("clubs");
  await clubsCol.createIndex({ username: 1 }, { unique: true });
  console.log("  Index: username (unique)");
  await clubsCol.createIndex({ stripeAccountId: 1 }, { sparse: true });
  console.log("  Index: stripeAccountId (sparse)");

  // --- Transactions Collection ---
  if (!existingNames.includes("transactions")) {
    await db.createCollection("transactions");
    console.log("\nCreated collection: transactions");
  } else {
    console.log("\nCollection already exists: transactions");
  }

  const txCol = db.collection("transactions");
  await txCol.createIndex({ clubId: 1, createdAt: -1 });
  console.log("  Index: clubId + createdAt (compound)");
  await txCol.createIndex({ stripeSessionId: 1 }, { unique: true });
  console.log("  Index: stripeSessionId (unique)");
  await txCol.createIndex({ createdAt: -1 });
  console.log("  Index: createdAt (descending)");

  // --- Teams Collection ---
  if (!existingNames.includes("teams")) {
    await db.createCollection("teams");
    console.log("\nCreated collection: teams");
  } else {
    console.log("\nCollection already exists: teams");
  }

  const teamsCol = db.collection("teams");
  await teamsCol.createIndex({ clubId: 1, createdAt: -1 });
  console.log("  Index: clubId + createdAt (compound)");
  await teamsCol.createIndex({ clubId: 1, season: 1 });
  console.log("  Index: clubId + season (compound)");

  // --- Parents Collection ---
  if (!existingNames.includes("parents")) {
    await db.createCollection("parents");
    console.log("\nCreated collection: parents");
  } else {
    console.log("\nCollection already exists: parents");
  }

  const parentsCol = db.collection("parents");
  await parentsCol.createIndex({ clubId: 1, createdAt: -1 });
  console.log("  Index: clubId + createdAt (compound)");
  await parentsCol.createIndex({ clubId: 1, email: 1 });
  console.log("  Index: clubId + email (compound)");

  // --- Registrations Collection ---
  if (!existingNames.includes("registrations")) {
    await db.createCollection("registrations");
    console.log("\nCreated collection: registrations");
  } else {
    console.log("\nCollection already exists: registrations");
  }

  const regsCol = db.collection("registrations");
  await regsCol.createIndex({ teamId: 1, createdAt: -1 });
  console.log("  Index: teamId + createdAt (compound)");
  await regsCol.createIndex({ clubId: 1, createdAt: -1 });
  console.log("  Index: clubId + createdAt (compound)");
  await regsCol.createIndex({ stripeSessionId: 1 }, { sparse: true });
  console.log("  Index: stripeSessionId (sparse)");
  await regsCol.createIndex({ stripeSubscriptionId: 1 }, { sparse: true });
  console.log("  Index: stripeSubscriptionId (sparse)");

  console.log("\n--- Setup Complete ---");
  console.log("Collections and indexes are ready.");
  console.log("Admin login is configured via ADMIN_USERNAME and ADMIN_PASSWORD in .env.local\n");

  await mongoose.disconnect();
}

setup().catch((err) => {
  console.error("Setup failed:", err);
  process.exit(1);
});
