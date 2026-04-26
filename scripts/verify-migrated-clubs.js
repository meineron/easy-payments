/**
 * Pre-push integrity check.
 *
 * For every club that is `migrationStatus = "migrated"`:
 *   - Compare each tenant collection's count against the matching legacy
 *     archive in main (`<collection>_x`, filtered by clubId).
 *   - Flag mismatches loudly.
 *
 * Read-only — touches no data.
 */

import mongoose from "mongoose";
import { config } from "dotenv";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(__dirname, "../.env.local") });

const TENANT_COLLECTIONS = [
  "players", "parents", "teams", "activities", "orders", "orderlogs",
  "registrations", "registrationrequests", "transactions",
  "paymentrequests", "messages", "leads", "leadsubmissions", "leadlogs",
];

async function run() {
  await mongoose.connect(process.env.MONGODB_URI);
  const main = mongoose.connection.db;

  const clubs = await main.collection("clubs").find(
    { migrationStatus: "migrated" },
    { projection: { name: 1, dbName: 1, status: 1 } },
  ).toArray();

  console.log(`Found ${clubs.length} migrated club(s).\n`);

  let ok = true;
  for (const club of clubs) {
    console.log(`== ${club.name} (${club._id}) → ${club.dbName} (${club.status}) ==`);
    const tenant = mongoose.connection.useDb(club.dbName, { useCache: true });
    const filter = { clubId: club._id };

    for (const name of TENANT_COLLECTIONS) {
      const legacyName = `${name}_x`;
      let legacyCount = 0;
      try {
        legacyCount = await main.collection(legacyName).countDocuments(filter);
      } catch (err) {
        // Collection may not exist if it had no data anywhere.
      }
      let tenantCount = 0;
      try {
        tenantCount = await tenant.collection(name).countDocuments();
      } catch (err) {
        // Tenant collection may not exist if source had 0 rows.
      }

      if (legacyCount === 0 && tenantCount === 0) continue;

      const match = legacyCount === tenantCount;
      if (!match) ok = false;
      const flag = match ? "OK " : "!! ";
      console.log(`  ${flag}${name}: legacy_x=${legacyCount}, tenant=${tenantCount}`);
    }
    console.log();
  }

  console.log(ok ? "OVERALL: OK — safe to push." : "OVERALL: MISMATCH — investigate before pushing.");
  await mongoose.disconnect();
  process.exit(ok ? 0 : 2);
}

run().catch((err) => {
  console.error("Verify failed:", err);
  process.exit(1);
});
