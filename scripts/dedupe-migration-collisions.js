/**
 * Clean up legacy duplicate player documents that block the DOB string
 * migration. For each (clubId, firstName, lastName) with one Date-typed
 * doc and one String-typed doc that both resolve to the same DOB day,
 * re-point references to the canonical (older, String) doc and delete
 * the duplicate (newer, Date) doc.
 *
 * Run:
 *   node scripts/dedupe-migration-collisions.js           (dry run)
 *   node scripts/dedupe-migration-collisions.js --apply   (actually writes)
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

async function run() {
  console.log(`Connecting to MongoDB...`);
  console.log(`  URI: ${MONGODB_URI.replace(/\/\/.*@/, "//***@")}`);
  console.log(`  TZ : ${TZ}`);
  console.log(`  Mode: ${APPLY ? "APPLY (writes enabled)" : "DRY RUN"}\n`);

  await mongoose.connect(MONGODB_URI);
  const db = mongoose.connection.db;
  const players = db.collection("players");
  const parents = db.collection("parents");
  const orders = db.collection("orders");

  const stragglers = await players
    .find({ dateOfBirth: { $type: "date" } })
    .project({ clubId: 1, firstName: 1, lastName: 1, dateOfBirth: 1, createdAt: 1 })
    .toArray();

  console.log(`Found ${stragglers.length} player doc(s) still Date-typed:\n`);

  let deleted = 0;
  let parentsUpdated = 0;
  const keepers = [];

  for (const dup of stragglers) {
    const dobStr = toDobString(dup.dateOfBirth, TZ);
    const canonicalFilter = {
      clubId: dup.clubId,
      firstName: dup.firstName,
      lastName: dup.lastName,
      dateOfBirth: dobStr,
      _id: { $ne: dup._id },
    };
    const canonical = await players
      .findOne(canonicalFilter, { collation: { locale: "en", strength: 2 } });

    console.log(`  dup ${dup._id} ${dup.firstName} ${dup.lastName} ${dup.dateOfBirth.toISOString()} → "${dobStr}"`);
    if (!canonical) {
      console.log(`    no canonical match — will keep as-is and force-string in place`);
      keepers.push({ _id: dup._id, dobStr });
      continue;
    }
    console.log(`    canonical: ${canonical._id} (createdAt ${canonical.createdAt?.toISOString?.() || "?"})`);

    // Check for any references from orders (must not exist for a safe delete).
    const refOrders = await orders.countDocuments({ playerId: dup._id });
    if (refOrders > 0) {
      console.log(`    ${refOrders} order(s) reference the duplicate → skipping delete`);
      keepers.push({ _id: dup._id, dobStr });
      continue;
    }

    // Repoint any parent.players entries from duplicate → canonical.
    const referencingParents = await parents.find({ players: dup._id }).toArray();
    for (const p of referencingParents) {
      const hasCanonical = (p.players || []).some((pid) => String(pid) === String(canonical._id));
      if (APPLY) {
        if (hasCanonical) {
          await parents.updateOne({ _id: p._id }, { $pull: { players: dup._id } });
        } else {
          await parents.updateOne(
            { _id: p._id },
            { $set: { "players.$[elem]": canonical._id } },
            { arrayFilters: [{ elem: dup._id }] },
          );
        }
      }
      parentsUpdated++;
    }

    if (APPLY) {
      await players.deleteOne({ _id: dup._id });
    }
    deleted++;
  }

  for (const k of keepers) {
    console.log(`\nForcing ${k._id} → "${k.dobStr}" (no canonical collision).`);
    if (APPLY) {
      await players.updateOne({ _id: k._id }, { $set: { dateOfBirth: k.dobStr } });
    }
  }

  console.log(`\nSummary: deleted=${deleted} parentsUpdated=${parentsUpdated} keepers=${keepers.length}`);
  if (!APPLY) console.log(`\nDry run only. Re-run with --apply to persist the changes.`);
  await mongoose.disconnect();
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
