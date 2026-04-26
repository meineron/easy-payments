/**
 * Seed Owner Users from existing Clubs
 *
 * For every Club row in the main DB, create:
 *   - A `User` row with the SAME username + bcrypt password hash, so existing
 *     club admins keep logging in with the credentials they already use.
 *   - An `owner` Membership linking that User to the Club, status=active.
 *
 * Idempotent: re-running skips clubs that already have a seeded owner User.
 *
 * Run with:
 *   node scripts/seed-owner-users.js
 *
 * After this completes successfully, the legacy Club credential branch in
 * `src/lib/auth.js` is no longer hit in practice and can be removed.
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

const ClubSchema = new mongoose.Schema({}, { strict: false, collection: "clubs" });
const UserSchema = new mongoose.Schema({}, { strict: false, collection: "users" });
const MembershipSchema = new mongoose.Schema({}, { strict: false, collection: "memberships" });

async function dropOldUserIndex(User, name) {
  try {
    await User.collection.dropIndex(name);
    console.log(`  dropped old User index "${name}"`);
  } catch (err) {
    // Index doesn't exist or can't be dropped — fine, the createIndex below
    // will either reuse the current spec or fail loudly.
    if (!/index not found/i.test(err.message)) {
      console.warn(`  could not drop User index "${name}": ${err.message}`);
    }
  }
}

async function run() {
  console.log("Connecting to MongoDB...");
  await mongoose.connect(MONGODB_URI);

  const Club = mongoose.model("Club", ClubSchema);
  const User = mongoose.model("User", UserSchema);
  const Membership = mongoose.model("Membership", MembershipSchema);

  // Make sure the partial-unique indexes exist (matching the User schema).
  // If older sparse-unique indexes are present from a previous run, drop them
  // first — they collide on multiple null values.
  await dropOldUserIndex(User, "username_1");
  await dropOldUserIndex(User, "email_1");
  await User.collection.createIndex(
    { username: 1 },
    { unique: true, partialFilterExpression: { username: { $type: "string" } } },
  );
  await User.collection.createIndex(
    { email: 1 },
    { unique: true, partialFilterExpression: { email: { $type: "string" } } },
  );
  await Membership.collection.createIndex({ userId: 1, clubId: 1 }, { unique: true });

  // Clean up any User docs from earlier runs that have `email: null` or
  // `username: null` — those would still trip the new partial index because
  // `null` is not a string but would still satisfy a previous sparse spec.
  await User.collection.updateMany(
    { email: null }, { $unset: { email: "" } },
  );
  await User.collection.updateMany(
    { username: null }, { $unset: { username: "" } },
  );

  const clubs = await Club.find({}).lean();
  console.log(`Found ${clubs.length} club(s)`);

  let created = 0;
  let skipped = 0;
  let conflict = 0;

  for (const club of clubs) {
    if (!club.username || !club.password) {
      console.log(`  Skipping club ${club._id} (${club.name}): no legacy username/password`);
      skipped++;
      continue;
    }

    const existingByUsername = await User.findOne({ username: club.username }).lean();

    let user;
    if (existingByUsername) {
      user = existingByUsername;
      console.log(`  Reusing existing User for username "${club.username}" (${club.name})`);
    } else {
      try {
        const userData = {
          username: club.username,
          password: club.password,
          firstName: club.name || "",
          lastName: "",
          status: "active",
          mustChangePassword: false,
          isPlatformAdmin: false,
          language: club.language || "en",
          createdAt: new Date(),
          updatedAt: new Date(),
        };
        if (club.supportEmail) userData.email = club.supportEmail;
        const inserted = await User.create(userData);
        user = inserted.toObject();
        created++;
        console.log(`  Created User for ${club.name} (username: ${club.username})`);
      } catch (err) {
        console.error(`  FAILED to create User for ${club.name}: ${err.message}`);
        conflict++;
        continue;
      }
    }

    const existingMembership = await Membership.findOne({
      userId: user._id,
      clubId: club._id,
    }).lean();

    if (!existingMembership) {
      await Membership.create({
        userId: user._id,
        clubId: club._id,
        mainRole: "owner",
        status: "active",
        invitedAt: club.createdAt || new Date(),
        acceptedAt: club.createdAt || new Date(),
        teams: [],
        lastChangedBy: "seed-script",
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      console.log(`    + owner Membership created for ${club.name}`);
    } else {
      console.log(`    = owner Membership already exists for ${club.name}`);
    }

    // Ensure the club is explicitly in `legacy` mode so getTenantConn() routes
    // it to the main DB. We deliberately do NOT stamp `dbName` here — that's
    // owned by `scripts/migrate-club-to-tenant-db.js phaseFlag`, which derives
    // a slug-based name (e.g. `club_aspire_fc`) when the migration starts.
    if (!club.migrationStatus) {
      await Club.updateOne({ _id: club._id }, { $set: { migrationStatus: "legacy" } });
    }
  }

  console.log(`\nDone. Created: ${created}, Skipped: ${skipped}, Conflicts: ${conflict}`);
  await mongoose.disconnect();
}

run().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});
