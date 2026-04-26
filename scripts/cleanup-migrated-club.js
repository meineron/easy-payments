/**
 * Final cleanup for a club that has been on `migrationStatus = "migrated"` for
 * long enough that we trust the new tenant DB. Drops the original tenant rows
 * out of the shared main DB so they stop wasting space and so accidental
 * legacy code paths fail loud rather than silently reading stale data.
 *
 * Safety:
 *   - Refuses to run unless Club.migrationStatus === "migrated".
 *   - Re-counts source vs. target before each drop and aborts if mismatched.
 *   - Always preserves PublicLookup / MigrationLog rows.
 *
 * USAGE:
 *   node scripts/cleanup-migrated-club.js --club <clubId>          # dry run
 *   node scripts/cleanup-migrated-club.js --club <clubId> --apply  # actually delete
 */

import mongoose from "mongoose";
import { config } from "dotenv";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(__dirname, "../.env.local") });

const TENANT_COLLECTIONS = [
  "players",
  "parents",
  "teams",
  "activities",
  "orders",
  "orderlogs",
  "registrations",
  "registrationrequests",
  "transactions",
  "paymentrequests",
  "messages",
  "leads",
  "leadsubmissions",
  "leadlogs",
];

function parseArgs() {
  const args = { club: null, apply: false };
  for (let i = 2; i < process.argv.length; i++) {
    const a = process.argv[i];
    if (a === "--club") args.club = process.argv[++i];
    else if (a === "--apply") args.apply = true;
  }
  if (!args.club) {
    console.error("Usage: --club <clubId> [--apply]");
    process.exit(1);
  }
  return args;
}

async function run() {
  const { club: clubId, apply } = parseArgs();
  await mongoose.connect(process.env.MONGODB_URI);
  const main = mongoose.connection.db;

  const club = await main.collection("clubs").findOne(
    { _id: new mongoose.Types.ObjectId(clubId) },
    { projection: { migrationStatus: 1, dbName: 1 } },
  );
  if (!club) { console.error(`Club ${clubId} not found`); process.exit(1); }
  if (club.migrationStatus !== "migrated") {
    console.error(`Refusing: club status is "${club.migrationStatus}", expected "migrated".`);
    process.exit(1);
  }

  const tenant = mongoose.connection.useDb(club.dbName, { useCache: true });
  const filter = { clubId: new mongoose.Types.ObjectId(clubId) };

  for (const name of TENANT_COLLECTIONS) {
    const sourceCount = await main.collection(name).countDocuments(filter);
    const targetCount = await tenant.collection(name).countDocuments();

    if (sourceCount === 0) {
      console.log(`  ${name}: nothing to clean (source=0)`);
      continue;
    }
    if (targetCount < sourceCount) {
      console.error(`  ${name}: ABORT — target(${targetCount}) < source(${sourceCount}). Re-run migrate copy first.`);
      process.exit(2);
    }

    if (!apply) {
      console.log(`  ${name}: DRY RUN — would delete ${sourceCount} rows from main`);
      continue;
    }
    const res = await main.collection(name).deleteMany(filter);
    console.log(`  ${name}: deleted ${res.deletedCount} rows from main`);
    await main.collection("migrationlogs").insertOne({
      clubId: new mongoose.Types.ObjectId(clubId),
      phase: "flip",
      level: "info",
      message: `cleanup: deleted ${res.deletedCount} rows from main/${name}`,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
  }

  if (!apply) console.log("\nDry run complete. Re-run with --apply to actually delete.");
  await mongoose.disconnect();
}

run().catch((err) => {
  console.error("Cleanup failed:", err);
  process.exit(1);
});
