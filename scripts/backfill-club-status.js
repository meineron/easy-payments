/**
 * Backfill `status` field on existing Clubs
 *
 * The new lifecycle field defaults to `active` in the schema, but pre-existing
 * documents won't have it persisted until they're saved. This one-shot script
 * adds `status: "active"` to every Club doc that doesn't already have one.
 *
 * Idempotent: re-running is a no-op once all clubs have a status.
 *
 * Run with:
 *   node scripts/backfill-club-status.js
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

async function main() {
  await mongoose.connect(MONGODB_URI);
  const db = mongoose.connection;

  const result = await db.collection("clubs").updateMany(
    { status: { $exists: false } },
    { $set: { status: "active" } },
  );

  console.log(`Backfilled status="active" on ${result.modifiedCount} club(s).`);

  const totalActive = await db.collection("clubs").countDocuments({ status: "active" });
  const totalDeactivated = await db.collection("clubs").countDocuments({ status: "deactivated" });
  console.log(`Active clubs:      ${totalActive}`);
  console.log(`Deactivated clubs: ${totalDeactivated}`);

  await mongoose.disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
