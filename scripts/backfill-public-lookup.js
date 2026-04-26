/**
 * Backfill the `publiclookups` collection from existing tenant data.
 *
 * Walks every collection that contains a publicly-addressable identifier
 * and records (kind, key) → clubId pairs:
 *
 *   activities          → kind=activity,            key=Activity._id
 *   orders              → kind=paymentToken,        key=Order.paymentToken
 *                       → kind=registrationToken,   key=Order.registrationToken
 *   paymentrequests     → kind=paymentToken,        key=PaymentRequest.paymentToken
 *   leads               → kind=leadSlug,            key=Lead.slug
 *   teams               → kind=team,                key=Team._id
 *
 * Tenant-aware: for each club, reads from main DB (legacy/migrating) or from
 * the club's own tenant DB (migrated). Idempotent — re-running upserts.
 *
 *   node scripts/backfill-public-lookup.js
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

async function upsertLookup(lookupsCol, kind, key, clubId) {
  if (!key || !clubId) return false;
  await lookupsCol.updateOne(
    { kind, key: String(key) },
    {
      $set: { kind, key: String(key), clubId, updatedAt: new Date() },
      $setOnInsert: { createdAt: new Date() },
    },
    { upsert: true },
  );
  return true;
}

// `tenantDb` is whichever DB currently holds the club's tenant data — the main
// DB for legacy/migrating clubs, the per-club DB for migrated ones.
//
// `clubFilter` is `{ clubId: <oid> }` for legacy/migrating (where the main DB
// holds many clubs in one collection) or `{}` for migrated (where every doc in
// the tenant DB belongs to this one club).
async function backfillForClub(mainDb, club) {
  const lookups = mainDb.collection("publiclookups");
  const status = club.migrationStatus || "legacy";

  let tenantDb;
  let clubFilter;
  if (status === "migrated") {
    tenantDb = mongoose.connection.useDb(club.dbName, { useCache: true });
    clubFilter = {};
  } else {
    tenantDb = mainDb;
    clubFilter = { clubId: club._id };
  }

  const counts = {
    activity: 0,
    paymentToken: 0,
    registrationToken: 0,
    paymentRequestToken: 0,
    leadSlug: 0,
    team: 0,
  };

  // Activities
  {
    const cursor = tenantDb.collection("activities").find(clubFilter, {
      projection: { _id: 1 },
    });
    while (await cursor.hasNext()) {
      const d = await cursor.next();
      try {
        if (await upsertLookup(lookups, "activity", d._id, club._id)) counts.activity++;
      } catch (err) {
        console.warn(`  ! activity/${d._id}: ${err.message}`);
      }
    }
  }

  // Orders — paymentToken + registrationToken
  {
    const cursor = tenantDb.collection("orders").find(clubFilter, {
      projection: { paymentToken: 1, registrationToken: 1 },
    });
    while (await cursor.hasNext()) {
      const d = await cursor.next();
      try {
        if (d.paymentToken && (await upsertLookup(lookups, "paymentToken", d.paymentToken, club._id))) {
          counts.paymentToken++;
        }
        if (d.registrationToken && (await upsertLookup(lookups, "registrationToken", d.registrationToken, club._id))) {
          counts.registrationToken++;
        }
      } catch (err) {
        console.warn(`  ! order: ${err.message}`);
      }
    }
  }

  // Payment requests — paymentToken
  {
    const cursor = tenantDb.collection("paymentrequests").find(clubFilter, {
      projection: { paymentToken: 1 },
    });
    while (await cursor.hasNext()) {
      const d = await cursor.next();
      try {
        if (await upsertLookup(lookups, "paymentToken", d.paymentToken, club._id)) {
          counts.paymentRequestToken++;
        }
      } catch (err) {
        console.warn(`  ! paymentrequest: ${err.message}`);
      }
    }
  }

  // Leads — leadSlug
  {
    const cursor = tenantDb.collection("leads").find(clubFilter, {
      projection: { slug: 1 },
    });
    while (await cursor.hasNext()) {
      const d = await cursor.next();
      try {
        if (await upsertLookup(lookups, "leadSlug", d.slug, club._id)) counts.leadSlug++;
      } catch (err) {
        console.warn(`  ! lead: ${err.message}`);
      }
    }
  }

  // Teams
  {
    const cursor = tenantDb.collection("teams").find(clubFilter, {
      projection: { _id: 1 },
    });
    while (await cursor.hasNext()) {
      const d = await cursor.next();
      try {
        if (await upsertLookup(lookups, "team", d._id, club._id)) counts.team++;
      } catch (err) {
        console.warn(`  ! team/${d._id}: ${err.message}`);
      }
    }
  }

  return { status, dbName: status === "migrated" ? club.dbName : "(main)", counts };
}

async function run() {
  console.log("Connecting to MongoDB...");
  await mongoose.connect(MONGODB_URI);
  const mainDb = mongoose.connection.db;

  await mainDb
    .collection("publiclookups")
    .createIndex({ kind: 1, key: 1 }, { unique: true });
  await mainDb.collection("publiclookups").createIndex({ clubId: 1 });

  const clubs = await mainDb
    .collection("clubs")
    .find({}, { projection: { name: 1, migrationStatus: 1, dbName: 1 } })
    .toArray();

  console.log(`Backfilling PublicLookup across ${clubs.length} club(s)...\n`);

  for (const club of clubs) {
    const { status, dbName, counts } = await backfillForClub(mainDb, club);
    console.log(
      `  ${club._id}  ${(club.name || "").padEnd(20)}  status=${status.padEnd(9)}  db=${dbName}\n` +
        `    activity=${counts.activity}  team=${counts.team}  ` +
        `paymentToken=${counts.paymentToken + counts.paymentRequestToken}  ` +
        `registrationToken=${counts.registrationToken}  leadSlug=${counts.leadSlug}`,
    );
  }

  console.log("\nDone.");
  await mongoose.disconnect();
}

run().catch(async (err) => {
  console.error("Backfill failed:", err);
  try { await mongoose.disconnect(); } catch {}
  process.exit(1);
});
