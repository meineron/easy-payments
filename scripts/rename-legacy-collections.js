/**
 * Canary script: rename the legacy per-tenant collections in the MAIN database
 * to `<name>_x` so any code path that still reads/writes the main DB for tenant
 * data fails loudly with `NamespaceNotFound` instead of silently corrupting.
 *
 * This is the *reversible* counterpart to `cleanup-migrated-club.js`:
 *   - cleanup deletes per-club rows (irreversible).
 *   - rename keeps the bytes intact under a parked name (reversible via --undo).
 *
 * Safety:
 *   - Refuses to run unless EVERY Club has migrationStatus === "migrated".
 *     The main DB still serves legacy/migrating clubs; renaming would break them.
 *   - Dry-run by default. Pass --apply to execute.
 *   - --undo restores `<name>_x` → `<name>` (also dry-run by default).
 *   - --force bypasses the all-migrated check (DO NOT USE in production unless
 *     you understand exactly which clubs will break).
 *   - Skips any collection whose target name already exists, so re-runs are safe.
 *   - Logs each rename to the `migrationlogs` collection (kept in main, not renamed).
 *
 * USAGE:
 *   node scripts/rename-legacy-collections.js                # dry-run rename
 *   node scripts/rename-legacy-collections.js --apply        # actually rename to *_x
 *   node scripts/rename-legacy-collections.js --undo         # dry-run undo
 *   node scripts/rename-legacy-collections.js --undo --apply # actually rename *_x back
 *   node scripts/rename-legacy-collections.js --apply --force  # bypass migration check
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

const SUFFIX = "_x";

function parseArgs() {
  const args = { apply: false, undo: false, force: false };
  for (let i = 2; i < process.argv.length; i++) {
    const a = process.argv[i];
    if (a === "--apply") args.apply = true;
    else if (a === "--undo") args.undo = true;
    else if (a === "--force") args.force = true;
    else {
      console.error(`Unknown arg: ${a}`);
      process.exit(1);
    }
  }
  return args;
}

async function listClubsByStatus(main) {
  const clubs = await main
    .collection("clubs")
    .find({}, { projection: { name: 1, migrationStatus: 1 } })
    .toArray();
  const byStatus = { legacy: [], migrating: [], migrated: [] };
  for (const c of clubs) {
    const s = c.migrationStatus || "legacy";
    if (!byStatus[s]) byStatus[s] = [];
    byStatus[s].push(c);
  }
  return { clubs, byStatus };
}

async function collectionExists(db, name) {
  const matches = await db.listCollections({ name }, { nameOnly: true }).toArray();
  return matches.length > 0;
}

async function logEvent(main, level, message, detail = null) {
  try {
    await main.collection("migrationlogs").insertOne({
      clubId: null,
      phase: "canary",
      level,
      message,
      detail,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
  } catch {
    // migrationlogs is best-effort; never fail the run on a log write.
  }
}

async function run() {
  const { apply, undo, force } = parseArgs();
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    console.error("MONGODB_URI missing in .env.local");
    process.exit(1);
  }

  await mongoose.connect(uri);
  const main = mongoose.connection.db;
  const dbName = main.databaseName;
  const action = undo ? "UNDO" : "RENAME";
  console.log(`\n[${action}] target db: ${dbName}\n`);

  const { clubs, byStatus } = await listClubsByStatus(main);
  console.log(
    `Clubs: total=${clubs.length}  ` +
      `legacy=${byStatus.legacy.length}  ` +
      `migrating=${byStatus.migrating.length}  ` +
      `migrated=${byStatus.migrated.length}`,
  );

  const notMigrated = [...byStatus.legacy, ...byStatus.migrating];
  if (!undo && notMigrated.length > 0 && !force) {
    console.error(
      `\nABORT: ${notMigrated.length} club(s) are not yet migrated.\n` +
        `Renaming the main-DB tenant collections would break them immediately.\n`,
    );
    for (const c of notMigrated) {
      console.error(`  - ${c._id} (${c.name}) status=${c.migrationStatus || "legacy"}`);
    }
    console.error(`\nMigrate them first, or pass --force if you really know what you're doing.`);
    await mongoose.disconnect();
    process.exit(2);
  }

  const plan = [];
  for (const name of TENANT_COLLECTIONS) {
    const from = undo ? `${name}${SUFFIX}` : name;
    const to = undo ? name : `${name}${SUFFIX}`;
    const fromExists = await collectionExists(main, from);
    const toExists = await collectionExists(main, to);
    plan.push({ from, to, fromExists, toExists });
  }

  console.log(`\nPlan (${apply ? "APPLY" : "DRY-RUN"}):`);
  for (const p of plan) {
    if (!p.fromExists) {
      console.log(`  -- skip ${p.from}: source missing`);
    } else if (p.toExists) {
      console.log(`  !! skip ${p.from} → ${p.to}: target already exists`);
    } else {
      console.log(`  ${apply ? "++" : "--"} ${p.from} → ${p.to}`);
    }
  }

  if (!apply) {
    console.log(`\nDry run only. Re-run with --apply to execute.`);
    await mongoose.disconnect();
    return;
  }

  let renamed = 0;
  let skipped = 0;
  for (const p of plan) {
    if (!p.fromExists || p.toExists) {
      skipped++;
      continue;
    }
    try {
      await main.collection(p.from).rename(p.to, { dropTarget: false });
      console.log(`  ✔ ${p.from} → ${p.to}`);
      renamed++;
      await logEvent(main, "info", `renamed ${p.from} → ${p.to}`, { db: dbName, force, undo });
    } catch (err) {
      console.error(`  ✗ ${p.from} → ${p.to}: ${err.message}`);
      await logEvent(main, "error", `rename failed ${p.from} → ${p.to}`, {
        db: dbName,
        error: err.message,
        force,
        undo,
      });
    }
  }

  console.log(`\nDone. renamed=${renamed} skipped=${skipped}`);
  await mongoose.disconnect();
}

run().catch(async (err) => {
  console.error("Rename failed:", err);
  try {
    await mongoose.disconnect();
  } catch {}
  process.exit(1);
});
