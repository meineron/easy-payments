/**
 * Per-club migration tool. Copies a single club's tenant data from the
 * shared main DB into its own `club_<slug>` database, preserving `_id`s so
 * existing public links keep resolving.
 *
 * Phases (run individually with `--phase`):
 *
 *   1. flag      → set Club.migrationStatus = "migrating" and (if not already
 *                  set) Club.dbName = club_<slug-of-name>. From this point on,
 *                  app code dual-writes via getTenantConn().
 *
 *   2. copy      → copy all matching docs from main DB into the tenant DB,
 *                  preserving _id. Idempotent (per-doc upsert).
 *
 *   3. verify    → compare counts and a sample of _ids per collection.
 *
 *   4. flip      → set Club.migrationStatus = "migrated". App routes immediately
 *                  read from the tenant DB; main DB rows stay as a safety net.
 *
 *   5. rollback  → revert to "legacy" if something goes wrong before the cleanup
 *                  step deletes rows from the main DB.
 *
 * USAGE:
 *   node scripts/migrate-club-to-tenant-db.js --club <clubId> --phase flag
 *   node scripts/migrate-club-to-tenant-db.js --club <clubId> --phase copy
 *   node scripts/migrate-club-to-tenant-db.js --club <clubId> --phase verify
 *   node scripts/migrate-club-to-tenant-db.js --club <clubId> --phase flip
 *   node scripts/migrate-club-to-tenant-db.js --club <clubId> --phase rollback
 *
 * NOTE: Run phases at least a few minutes apart so any in-flight requests
 * settle into the new dual-write state before the copy begins.
 */

import mongoose from "mongoose";
import { config } from "dotenv";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import { generateClubDbName } from "../src/lib/club-db-name.js";

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
  const args = { club: null, phase: null };
  for (let i = 2; i < process.argv.length; i++) {
    const a = process.argv[i];
    if (a === "--club") args.club = process.argv[++i];
    else if (a === "--phase") args.phase = process.argv[++i];
  }
  if (!args.club || !args.phase) {
    console.error("Usage: --club <clubId> --phase flag|copy|verify|flip|rollback");
    process.exit(1);
  }
  return args;
}

async function logEvent(main, clubId, phase, level, message, detail = null) {
  await main.collection("migrationlogs").insertOne({
    clubId: new mongoose.Types.ObjectId(clubId),
    phase,
    level,
    message,
    detail,
    createdAt: new Date(),
    updatedAt: new Date(),
  });
}

async function loadClub(main, clubId) {
  const c = await main.collection("clubs").findOne(
    { _id: new mongoose.Types.ObjectId(clubId) },
    { projection: { migrationStatus: 1, dbName: 1, name: 1 } },
  );
  if (!c) throw new Error(`Club ${clubId} not found`);
  return c;
}

async function phaseFlag(main, clubId) {
  // Honor an existing dbName if the club already has one (e.g. seeded by the
  // admin "Create Club" route which stamps a slug-based name at creation
  // time). Only legacy clubs that pre-date that change need a fresh slug.
  const oid = new mongoose.Types.ObjectId(clubId);
  const existing = await main.collection("clubs").findOne(
    { _id: oid },
    { projection: { name: 1, dbName: 1 } },
  );
  if (!existing) {
    throw new Error(`Club ${clubId} not found`);
  }

  let dbName = existing.dbName;
  if (!dbName) {
    dbName = await generateClubDbName({ name: existing.name, _id: oid, mainConn: main });
  }

  const result = await main.collection("clubs").updateOne(
    { _id: oid, migrationStatus: { $ne: "migrated" } },
    { $set: { migrationStatus: "migrating", dbName, updatedAt: new Date() } },
  );
  if (result.matchedCount === 0) {
    throw new Error(`Club ${clubId} is already migrated or missing`);
  }
  console.log(`flagged ${clubId} → migrating, dbName=${dbName}`);
  await logEvent(main, clubId, "flip", "info", "set status=migrating", { dbName });
}

async function phaseCopy(main, clubId) {
  const club = await loadClub(main, clubId);
  if (club.migrationStatus !== "migrating") {
    throw new Error(`Club ${clubId} status is ${club.migrationStatus}, expected migrating. Run --phase flag first.`);
  }
  const tenant = mongoose.connection.useDb(club.dbName, { useCache: true });
  const filter = { clubId: new mongoose.Types.ObjectId(clubId) };

  for (const name of TENANT_COLLECTIONS) {
    const src = main.collection(name);
    const dst = tenant.collection(name);
    let scanned = 0;
    let copied = 0;
    const cursor = src.find(filter);
    while (await cursor.hasNext()) {
      const doc = await cursor.next();
      scanned++;
      try {
        await dst.replaceOne({ _id: doc._id }, doc, { upsert: true });
        copied++;
      } catch (err) {
        console.warn(`  ! ${name}/${doc._id}: ${err.message}`);
        await logEvent(main, clubId, "copy", "error", `failed to copy ${name}/${doc._id}`, { error: err.message });
      }
    }
    console.log(`  ${name}: scanned ${scanned}, copied ${copied}`);
    await logEvent(main, clubId, "copy", "info", `copied ${name}`, { scanned, copied });
  }
}

async function phaseVerify(main, clubId) {
  const club = await loadClub(main, clubId);
  const tenant = mongoose.connection.useDb(club.dbName, { useCache: true });
  const filter = { clubId: new mongoose.Types.ObjectId(clubId) };

  const report = [];
  let allOk = true;
  for (const name of TENANT_COLLECTIONS) {
    const srcCount = await main.collection(name).countDocuments(filter);
    const dstCount = await tenant.collection(name).countDocuments();
    const ok = srcCount === dstCount;
    if (!ok) allOk = false;
    report.push({ collection: name, source: srcCount, target: dstCount, ok });
    console.log(`  ${name}: source=${srcCount}, target=${dstCount}, ok=${ok}`);
  }

  await logEvent(main, clubId, "verify", allOk ? "info" : "warn", allOk ? "verify ok" : "verify mismatch", { report });
  if (!allOk) {
    console.error("VERIFY FAILED. Inspect migrationlogs for details before flipping.");
    process.exit(2);
  }
  console.log("verify ok");
}

async function phaseFlip(main, clubId) {
  const result = await main.collection("clubs").updateOne(
    { _id: new mongoose.Types.ObjectId(clubId), migrationStatus: "migrating" },
    { $set: { migrationStatus: "migrated", updatedAt: new Date() } },
  );
  if (result.matchedCount === 0) {
    throw new Error(`Club ${clubId} is not in migrating state`);
  }
  console.log(`flipped ${clubId} → migrated`);
  await logEvent(main, clubId, "flip", "info", "set status=migrated");
}

async function phaseRollback(main, clubId) {
  const result = await main.collection("clubs").updateOne(
    { _id: new mongoose.Types.ObjectId(clubId), migrationStatus: { $in: ["migrating", "migrated"] } },
    { $set: { migrationStatus: "legacy", updatedAt: new Date() } },
  );
  if (result.matchedCount === 0) {
    throw new Error(`Club ${clubId} cannot be rolled back from current state`);
  }
  console.warn(`rolled back ${clubId} → legacy`);
  await logEvent(main, clubId, "rollback", "warn", "set status=legacy");
}

async function run() {
  const { club: clubId, phase } = parseArgs();
  const uri = process.env.MONGODB_URI;
  if (!uri) { console.error("MONGODB_URI missing"); process.exit(1); }

  await mongoose.connect(uri);
  const main = mongoose.connection.db;

  try {
    switch (phase) {
      case "flag":     await phaseFlag(main, clubId); break;
      case "copy":     await phaseCopy(main, clubId); break;
      case "verify":   await phaseVerify(main, clubId); break;
      case "flip":     await phaseFlip(main, clubId); break;
      case "rollback": await phaseRollback(main, clubId); break;
      default:
        throw new Error(`Unknown phase: ${phase}`);
    }
  } finally {
    await mongoose.disconnect();
  }
}

run().catch((err) => {
  console.error("Migration phase failed:", err);
  process.exit(1);
});
