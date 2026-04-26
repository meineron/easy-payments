/**
 * Per-club archive for a club that has reached `migrationStatus = "migrated"`.
 *
 * Unlike `cleanup-migrated-club.js`, this does NOT delete the legacy rows. It
 * moves them out of the shared main-DB collections into per-club archive
 * collections in the SAME database, named:
 *
 *   players      → players__x_<slug>
 *   teams        → teams__x_<slug>
 *   ...etc.
 *
 * Why move-instead-of-delete:
 *   - Same defense-in-depth as cleanup: any code path that accidentally reads
 *     from main DB for a migrated club returns zero rows, surfacing the bug
 *     instead of returning stale data.
 *   - Reversible: rolling back is `aggregate $out` from the `__x_<slug>`
 *     collection back into the live one.
 *   - Independent backup, separate from `club_<slug>` (so dropping the tenant
 *     DB by mistake doesn't lose the data).
 *
 * Safety:
 *   - Refuses to run unless Club.migrationStatus === "migrated".
 *   - Aborts if the destination archive collection already has data (so a
 *     re-run can't merge two snapshots into one collection).
 *   - Re-counts source vs. tenant before each move — if tenant has fewer
 *     rows, we abort (means the copy/verify phases were not run cleanly).
 *   - PublicLookup / MigrationLog / Memberships / Users / Clubs are never
 *     touched.
 *
 * USAGE:
 *   node scripts/archive-migrated-club.js --club <clubId>          # dry run
 *   node scripts/archive-migrated-club.js --club <clubId> --apply  # do it
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

function archiveSlugFromDbName(dbName) {
  // dbName is `club_<slug>`; archive suffix uses just `<slug>`.
  return String(dbName || "").replace(/^club_/, "") || "unknown";
}

async function run() {
  const { club: clubId, apply } = parseArgs();
  await mongoose.connect(process.env.MONGODB_URI);
  const main = mongoose.connection.db;

  const club = await main.collection("clubs").findOne(
    { _id: new mongoose.Types.ObjectId(clubId) },
    { projection: { migrationStatus: 1, dbName: 1, name: 1 } },
  );
  if (!club) { console.error(`Club ${clubId} not found`); process.exit(1); }
  if (club.migrationStatus !== "migrated") {
    console.error(`Refusing: club status is "${club.migrationStatus}", expected "migrated".`);
    process.exit(1);
  }
  if (!club.dbName) {
    console.error("Refusing: club has no dbName set.");
    process.exit(1);
  }

  const slug = archiveSlugFromDbName(club.dbName);
  const tenant = mongoose.connection.useDb(club.dbName, { useCache: true });
  const filter = { clubId: new mongoose.Types.ObjectId(clubId) };

  console.log(`Archiving legacy rows for ${club.name} (${clubId}) → __x_${slug}`);
  console.log(apply ? "MODE: APPLY" : "MODE: DRY RUN (re-run with --apply to execute)\n");

  let totalMoved = 0;
  for (const name of TENANT_COLLECTIONS) {
    const sourceCount = await main.collection(name).countDocuments(filter);
    if (sourceCount === 0) {
      console.log(`  ${name}: nothing to archive (source=0)`);
      continue;
    }

    const tenantCount = await tenant.collection(name).countDocuments();
    if (tenantCount < sourceCount) {
      console.error(`  ${name}: ABORT — tenant(${tenantCount}) < main-source(${sourceCount}). Re-run migrate copy/verify first.`);
      process.exit(2);
    }

    const archiveName = `${name}__x_${slug}`;
    const archiveExisting = await main.collection(archiveName).countDocuments();
    if (archiveExisting > 0) {
      console.error(`  ${name}: ABORT — ${archiveName} already has ${archiveExisting} docs. Drop or rename it first.`);
      process.exit(3);
    }

    if (!apply) {
      console.log(`  ${name}: DRY — would move ${sourceCount} rows → ${archiveName}`);
      continue;
    }

    // 1. Copy this club's rows into the archive collection (server-side $out).
    await main.collection(name)
      .aggregate([{ $match: filter }, { $out: archiveName }])
      .toArray();

    // 2. Confirm the archive landed before we delete the source.
    const archived = await main.collection(archiveName).countDocuments();
    if (archived !== sourceCount) {
      console.error(`  ${name}: ABORT — archive landed ${archived}/${sourceCount}. Source NOT deleted.`);
      process.exit(4);
    }

    // 3. Now safe to remove the live rows.
    const del = await main.collection(name).deleteMany(filter);
    totalMoved += del.deletedCount;
    console.log(`  ${name}: moved ${del.deletedCount} → ${archiveName}`);

    await main.collection("migrationlogs").insertOne({
      clubId: new mongoose.Types.ObjectId(clubId),
      phase: "flip",
      level: "info",
      message: `archive: moved ${del.deletedCount} rows from main/${name} → ${archiveName}`,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
  }

  if (apply) {
    console.log(`\nDone. Total rows archived: ${totalMoved}`);
    console.log(`Rollback: aggregate $out each ${TENANT_COLLECTIONS[0]}__x_${slug} (etc.) back to its source name, OR flip migrationStatus to legacy AFTER restoring.`);
  } else {
    console.log("\nDry run complete. Re-run with --apply to actually archive.");
  }
  await mongoose.disconnect();
}

run().catch((err) => {
  console.error("Archive failed:", err);
  process.exit(1);
});
