/**
 * Migrate all stored DOBs from `Date` objects to `"YYYY-MM-DD"` strings.
 *
 * Historically, DOBs came in through admin forms and `<input type="date">`
 * as YYYY-MM-DD strings, then Mongoose cast them to `Date`. Depending on
 * where the save was initiated (Heroku running UTC, or an admin running
 * locally in Asia/Jerusalem), the timestamp was stored at either:
 *   - UTC midnight (00:00Z)        → day matches
 *   - Israel-local midnight        → 21:00Z or 22:00Z previous day (a "day
 *                                    back" when formatted as UTC)
 *
 * This script interprets the stored timestamp in the Israel timezone (or
 * whatever `DOB_MIGRATION_TZ` is set to) and writes back a plain
 * `"YYYY-MM-DD"` string so the calendar day is locked in and rendering
 * never drifts again.
 *
 * Idempotent: rows that are already strings are skipped.
 *
 * Run:
 *   node scripts/migrate-dob-to-string.js          (dry run, shows counts)
 *   node scripts/migrate-dob-to-string.js --apply  (actually writes)
 *
 * Env:
 *   MONGODB_URI        - required, read from .env.local
 *   DOB_MIGRATION_TZ   - optional, defaults to "Asia/Jerusalem"
 */

import mongoose from "mongoose";
import { config } from "dotenv";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import { toDobString } from "../src/lib/dob.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(__dirname, "../.env.local") });

const MONGODB_URI = process.env.MONGODB_URI;
const TZ = process.env.DOB_MIGRATION_TZ || "Asia/Jerusalem";
const APPLY = process.argv.includes("--apply");

if (!MONGODB_URI) {
  console.error("ERROR: MONGODB_URI not found in .env.local");
  process.exit(1);
}

const TARGETS = [
  { coll: "players", field: "dateOfBirth" },
  { coll: "orders", field: "playerDob" },
  { coll: "registrations", field: "playerDob" },
];

async function migrateCollection(db, { coll, field }) {
  const collection = db.collection(coll);
  const filter = { [field]: { $type: "date" } };
  const total = await collection.countDocuments(filter);
  if (total === 0) {
    console.log(`  ${coll}.${field}: nothing to migrate`);
    return { converted: 0, nulled: 0, total: 0 };
  }

  console.log(`  ${coll}.${field}: ${total} doc(s) have Date values`);

  const cursor = collection.find(filter, { projection: { _id: 1, [field]: 1 } });
  const BATCH = 500;
  let ops = [];
  let converted = 0;
  let nulled = 0;
  let collisions = 0;
  const samples = [];
  const collisionIds = [];

  async function flush() {
    if (!APPLY || ops.length === 0) return;
    try {
      await collection.bulkWrite(ops, { ordered: false });
    } catch (err) {
      // Unique-index collisions happen when two legacy rows resolved to the
      // same canonical string. Those docs are left as Date and reported.
      const writeErrs = err?.writeErrors || err?.errorResponse?.writeErrors || [];
      for (const we of writeErrs) {
        collisions++;
        const idx = we?.index ?? we?.err?.index;
        const op = typeof idx === "number" ? ops[idx] : null;
        const failedId = op?.updateOne?.filter?._id;
        if (failedId) collisionIds.push(String(failedId));
      }
      if (writeErrs.length === 0) throw err;
    } finally {
      ops = [];
    }
  }

  while (await cursor.hasNext()) {
    const doc = await cursor.next();
    const val = doc[field];
    const str = toDobString(val, TZ);
    if (samples.length < 5) {
      samples.push({
        _id: String(doc._id),
        from: val instanceof Date ? val.toISOString() : String(val),
        to: str,
      });
    }
    if (str) {
      converted++;
      ops.push({ updateOne: { filter: { _id: doc._id }, update: { $set: { [field]: str } } } });
    } else {
      nulled++;
      ops.push({ updateOne: { filter: { _id: doc._id }, update: { $set: { [field]: null } } } });
    }
    if (ops.length >= BATCH) await flush();
  }
  await flush();

  console.log(`    sample:`);
  for (const s of samples) {
    console.log(`      ${s._id}  ${s.from}  →  ${s.to}`);
  }
  console.log(`    would convert: ${converted}, would null: ${nulled}${collisions ? `, collisions: ${collisions}` : ""}`);
  if (collisionIds.length) {
    console.log(`    collision _ids (left as Date, manual review):`);
    for (const id of collisionIds) console.log(`      ${id}`);
  }
  return { converted, nulled, collisions, total };
}

async function run() {
  console.log(`Connecting to MongoDB...`);
  console.log(`  URI: ${MONGODB_URI.replace(/\/\/.*@/, "//***@")}`);
  console.log(`  TZ : ${TZ}`);
  console.log(`  Mode: ${APPLY ? "APPLY (writes enabled)" : "DRY RUN"}\n`);

  await mongoose.connect(MONGODB_URI);
  const db = mongoose.connection.db;

  const summary = {};
  for (const target of TARGETS) {
    summary[`${target.coll}.${target.field}`] = await migrateCollection(db, target);
  }

  console.log(`\nDone.`);
  console.table(summary);
  if (!APPLY) {
    console.log(`\nDry run only. Re-run with --apply to persist the changes.`);
  }

  await mongoose.disconnect();
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
