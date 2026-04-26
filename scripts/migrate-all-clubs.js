/**
 * Bulk-migrates every Club to its own tenant DB by orchestrating
 * scripts/migrate-club-to-tenant-db.js for each club, in sequence:
 *
 *     legacy    → flag → copy → verify → flip → migrated
 *     migrating →        copy → verify → flip → migrated
 *     migrated  → (skipped)
 *
 * Aborts the whole run on the first phase failure (e.g. a verify mismatch).
 *
 * USAGE:
 *   node scripts/migrate-all-clubs.js                # plan only (no writes)
 *   node scripts/migrate-all-clubs.js --apply        # run the full flow
 *   node scripts/migrate-all-clubs.js --apply \
 *        --backfill-public-lookup                    # also runs the prerequisite
 *
 * NOTE: Run during a quiet window. Each club is migrated end-to-end before the
 * next one starts, so partial failure leaves you with a consistent state
 * (some clubs migrated, the rest still legacy).
 */

import mongoose from "mongoose";
import { spawn } from "child_process";
import { config } from "dotenv";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(__dirname, "../.env.local") });

const MIGRATE_SCRIPT = resolve(__dirname, "./migrate-club-to-tenant-db.js");
const BACKFILL_SCRIPT = resolve(__dirname, "./backfill-public-lookup.js");

function parseArgs() {
  const args = { apply: false, backfill: false };
  for (let i = 2; i < process.argv.length; i++) {
    const a = process.argv[i];
    if (a === "--apply") args.apply = true;
    else if (a === "--backfill-public-lookup") args.backfill = true;
    else {
      console.error(`Unknown arg: ${a}`);
      process.exit(1);
    }
  }
  return args;
}

function runPhase(clubId, phase) {
  return new Promise((resolveP, rejectP) => {
    const child = spawn(
      process.execPath,
      [MIGRATE_SCRIPT, "--club", clubId, "--phase", phase],
      { stdio: "inherit", env: process.env },
    );
    child.on("exit", (code) => {
      if (code === 0) resolveP();
      else rejectP(new Error(`phase ${phase} for ${clubId} exited with code ${code}`));
    });
    child.on("error", rejectP);
  });
}

function runScript(scriptPath) {
  return new Promise((resolveP, rejectP) => {
    const child = spawn(process.execPath, [scriptPath], { stdio: "inherit", env: process.env });
    child.on("exit", (code) => {
      if (code === 0) resolveP();
      else rejectP(new Error(`${scriptPath} exited with code ${code}`));
    });
    child.on("error", rejectP);
  });
}

async function listClubs() {
  await mongoose.connect(process.env.MONGODB_URI);
  const clubs = await mongoose.connection.db
    .collection("clubs")
    .find({}, { projection: { name: 1, migrationStatus: 1, dbName: 1 } })
    .sort({ createdAt: 1 })
    .toArray();
  await mongoose.disconnect();
  return clubs.map((c) => ({
    _id: String(c._id),
    name: c.name || "(unnamed)",
    status: c.migrationStatus || "legacy",
    dbName: c.dbName || null,
  }));
}

function phasesForStatus(status) {
  if (status === "legacy") return ["flag", "copy", "verify", "flip"];
  if (status === "migrating") return ["copy", "verify", "flip"];
  return [];
}

async function run() {
  const { apply, backfill } = parseArgs();
  if (!process.env.MONGODB_URI) {
    console.error("MONGODB_URI missing in .env.local");
    process.exit(1);
  }

  console.log(`\n[${apply ? "APPLY" : "PLAN"}] migrate-all-clubs\n`);

  const clubs = await listClubs();
  const tally = { legacy: 0, migrating: 0, migrated: 0 };
  for (const c of clubs) tally[c.status] = (tally[c.status] || 0) + 1;

  console.log(
    `Found ${clubs.length} club(s):  ` +
      `legacy=${tally.legacy || 0}  ` +
      `migrating=${tally.migrating || 0}  ` +
      `migrated=${tally.migrated || 0}\n`,
  );

  const work = clubs
    .map((c) => ({ ...c, phases: phasesForStatus(c.status) }))
    .filter((c) => c.phases.length > 0);

  if (work.length === 0) {
    console.log("Nothing to do — every club is already migrated.");
    return;
  }

  console.log("Plan:");
  for (const c of work) {
    console.log(`  ${c._id}  ${c.name.padEnd(30)} status=${c.status}  →  ${c.phases.join(" → ")}  →  migrated`);
  }

  if (!apply) {
    console.log(`\nPlan only. Re-run with --apply to execute.`);
    return;
  }

  if (backfill) {
    console.log(`\n--- Pre-flight: backfill PublicLookup ---`);
    await runScript(BACKFILL_SCRIPT);
  }

  let success = 0;
  let failed = null;
  for (const c of work) {
    console.log(`\n=== Migrating ${c._id} (${c.name}) — status=${c.status} ===`);
    try {
      for (const phase of c.phases) {
        console.log(`\n--- Phase: ${phase} ---`);
        await runPhase(c._id, phase);
      }
      success++;
    } catch (err) {
      failed = { club: c, error: err };
      console.error(`\n!!! ABORTING after failure on ${c._id}: ${err.message}`);
      break;
    }
  }

  console.log(`\n--- Summary ---`);
  console.log(`Migrated this run: ${success} / ${work.length}`);
  if (failed) {
    console.error(`Stopped at: ${failed.club._id} (${failed.club.name}) — ${failed.error.message}`);
    console.error(`Inspect migrationlogs in the main DB and resume by re-running --apply.`);
    process.exit(2);
  }
  console.log(`All done. Every club is now migrated.`);
}

run().catch(async (err) => {
  console.error("migrate-all-clubs failed:", err);
  try { await mongoose.disconnect(); } catch {}
  process.exit(1);
});
