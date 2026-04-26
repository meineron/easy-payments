/**
 * Rename a club's tenant database. MongoDB has no native db-rename, so this
 * script:
 *
 *   1. Validates the target name (doesn't collide with another club, doesn't
 *      already exist with data).
 *   2. Copies every collection (with all docs and indexes) from the old DB
 *      into the new DB, preserving _id.
 *   3. Verifies counts match.
 *   4. Updates Club.dbName in the main DB.
 *   5. (with --drop-old) drops the old DB.
 *
 * Defaults to dry-run. Use --apply to commit. Use --drop-old to also drop
 * the original DB after a successful rename.
 *
 * USAGE:
 *   node scripts/rename-club-db.js --club <clubId> --to club_aspire
 *   node scripts/rename-club-db.js --club <clubId> --to club_aspire --apply
 *   node scripts/rename-club-db.js --club <clubId> --to club_aspire --apply --drop-old
 *
 * SAFETY: do this during a quiet window. If a request comes in mid-copy and
 * the club is `migrated`, dual-DB writes are NOT in effect — that route will
 * still hit the OLD dbName until step 4 lands. Keep the window short.
 */

import mongoose from "mongoose";
import { config } from "dotenv";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(__dirname, "../.env.local") });

function parseArgs() {
  const args = { club: null, to: null, apply: false, dropOld: false };
  for (let i = 2; i < process.argv.length; i++) {
    const a = process.argv[i];
    if (a === "--club") args.club = process.argv[++i];
    else if (a === "--to") args.to = process.argv[++i];
    else if (a === "--apply") args.apply = true;
    else if (a === "--drop-old") args.dropOld = true;
    else { console.error(`Unknown arg: ${a}`); process.exit(1); }
  }
  if (!args.club || !args.to) {
    console.error("Usage: --club <clubId> --to <newDbName> [--apply] [--drop-old]");
    process.exit(1);
  }
  if (!/^[a-zA-Z0-9_-]+$/.test(args.to)) {
    console.error(`Invalid db name: ${args.to}`);
    process.exit(1);
  }
  return args;
}

async function listCollections(conn) {
  // `useDb()` returns a Mongoose Connection; the native Db is at `.db`.
  // Direct native Db usage is also supported (no `.db` accessor).
  const native = conn.db || conn;
  return await native.listCollections({}, { nameOnly: false }).toArray();
}

async function copyCollection(srcDb, dstDb, name) {
  const src = srcDb.collection(name);
  const dst = dstDb.collection(name);

  const total = await src.countDocuments();
  let copied = 0;
  if (total > 0) {
    const cursor = src.find({});
    const batch = [];
    while (await cursor.hasNext()) {
      batch.push(await cursor.next());
      if (batch.length >= 500) {
        const ops = batch.map((doc) => ({
          replaceOne: { filter: { _id: doc._id }, replacement: doc, upsert: true },
        }));
        await dst.bulkWrite(ops, { ordered: false });
        copied += batch.length;
        batch.length = 0;
      }
    }
    if (batch.length > 0) {
      const ops = batch.map((doc) => ({
        replaceOne: { filter: { _id: doc._id }, replacement: doc, upsert: true },
      }));
      await dst.bulkWrite(ops, { ordered: false });
      copied += batch.length;
    }
  }

  // Recreate indexes (skip the implicit _id_ index — Mongo creates it on insert).
  const indexes = await src.indexes();
  let createdIdx = 0;
  for (const idx of indexes) {
    if (idx.name === "_id_") continue;
    const { key, name: idxName, ...options } = idx;
    delete options.v;
    delete options.ns;
    try {
      await dst.createIndex(key, { name: idxName, ...options });
      createdIdx++;
    } catch (err) {
      if (!/already exists/i.test(err.message)) {
        console.warn(`    ! index ${idxName}: ${err.message}`);
      }
    }
  }

  return { copied, total, indexes: createdIdx };
}

async function run() {
  const { club: clubId, to: newDbName, apply, dropOld } = parseArgs();
  await mongoose.connect(process.env.MONGODB_URI);
  const main = mongoose.connection.db;

  const oid = new mongoose.Types.ObjectId(clubId);
  const club = await main.collection("clubs").findOne(
    { _id: oid },
    { projection: { name: 1, migrationStatus: 1, dbName: 1 } },
  );
  if (!club) { console.error(`Club ${clubId} not found`); process.exit(1); }

  const oldDbName = club.dbName;
  if (!oldDbName) {
    console.error(`Club ${clubId} has no dbName set — nothing to rename.`);
    process.exit(1);
  }
  if (oldDbName === newDbName) {
    console.error(`Club ${clubId} already has dbName=${newDbName}.`);
    process.exit(1);
  }

  console.log(`\n[${apply ? "APPLY" : "DRY-RUN"}] rename-club-db`);
  console.log(`  club:    ${clubId} (${club.name || "?"})`);
  console.log(`  status:  ${club.migrationStatus || "legacy"}`);
  console.log(`  from:    ${oldDbName}`);
  console.log(`  to:      ${newDbName}\n`);

  // Conflict check — another club must not already use this dbName.
  const conflict = await main.collection("clubs").findOne(
    { _id: { $ne: oid }, dbName: newDbName },
    { projection: { name: 1 } },
  );
  if (conflict) {
    console.error(`ABORT: another club already uses dbName=${newDbName}: ${conflict._id} (${conflict.name})`);
    process.exit(2);
  }

  const srcDb = mongoose.connection.useDb(oldDbName, { useCache: true });
  const dstDb = mongoose.connection.useDb(newDbName, { useCache: true });

  const srcCollections = await listCollections(srcDb);
  const dstCollections = await listCollections(dstDb);

  if (dstCollections.length > 0) {
    const dstNames = dstCollections.map((c) => c.name);
    let dstHasData = false;
    for (const name of dstNames) {
      const c = await dstDb.collection(name).countDocuments();
      if (c > 0) { dstHasData = true; break; }
    }
    if (dstHasData) {
      console.error(`ABORT: target db ${newDbName} already exists and contains data:`);
      for (const name of dstNames) {
        const c = await dstDb.collection(name).countDocuments();
        console.error(`  - ${name}: ${c} docs`);
      }
      console.error(`Drop or empty it manually before retrying.`);
      process.exit(2);
    }
  }

  console.log(`Source db has ${srcCollections.length} collection(s).`);
  for (const c of srcCollections) {
    const n = await srcDb.collection(c.name).countDocuments();
    console.log(`  - ${c.name}: ${n} docs`);
  }

  if (!apply) {
    console.log(`\nDry run only. Re-run with --apply to execute.`);
    await mongoose.disconnect();
    return;
  }

  // 1+2. Copy
  console.log(`\nCopying ${srcCollections.length} collection(s) → ${newDbName} ...`);
  let totalDocs = 0;
  for (const c of srcCollections) {
    const { copied, total, indexes } = await copyCollection(srcDb, dstDb, c.name);
    totalDocs += copied;
    console.log(`  ✔ ${c.name}: copied ${copied}/${total}, indexes=${indexes}`);
  }

  // 3. Verify
  console.log(`\nVerifying counts ...`);
  let allOk = true;
  for (const c of srcCollections) {
    const s = await srcDb.collection(c.name).countDocuments();
    const d = await dstDb.collection(c.name).countDocuments();
    const ok = s === d;
    if (!ok) allOk = false;
    console.log(`  ${c.name}: src=${s} dst=${d} ok=${ok}`);
  }
  if (!allOk) {
    console.error(`ABORT: verify mismatch. Old DB still has the source of truth — Club.dbName NOT updated.`);
    await mongoose.disconnect();
    process.exit(2);
  }

  // 4. Flip Club.dbName
  await main.collection("clubs").updateOne(
    { _id: oid },
    { $set: { dbName: newDbName, updatedAt: new Date() } },
  );
  await main.collection("migrationlogs").insertOne({
    clubId: oid,
    phase: "canary",
    level: "info",
    message: `renamed tenant db: ${oldDbName} → ${newDbName}`,
    detail: { totalDocs },
    createdAt: new Date(),
    updatedAt: new Date(),
  });
  console.log(`\nClub.dbName flipped: ${oldDbName} → ${newDbName}`);

  // 5. Drop old (best-effort — rename has already succeeded by this point).
  if (dropOld) {
    console.log(`\nDropping old db ${oldDbName} ...`);
    try {
      await srcDb.dropDatabase();
      console.log(`  ✔ dropped`);
    } catch (err) {
      console.warn(
        `  ! could not drop ${oldDbName}: ${err.message}\n` +
          `    (rename itself succeeded — drop it manually in Compass / Atlas if you want.)`,
      );
    }
  } else {
    console.log(`\nOld db ${oldDbName} kept as a safety net. Run with --drop-old to remove.`);
  }

  console.log(`\nDone.`);
  await mongoose.disconnect();
}

run().catch(async (err) => {
  console.error("Rename failed:", err);
  try { await mongoose.disconnect(); } catch {}
  process.exit(1);
});
