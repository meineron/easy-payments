/**
 * Migrate existing ClubUser rows → User + Membership.
 *
 * For each unique email across the whole `clubusers` collection:
 *   - Create one `User` row (or reuse the existing one if email already maps
 *     to a User from owner-seed). Username is generated from the email's
 *     local-part with a numeric suffix on collision.
 *   - For each ClubUser row owned by that email, create one Membership.
 *
 * Status mapping (matches src/models/Membership.js enum):
 *   ClubUser.status === "active"   → Membership.status = "active"
 *   ClubUser.status === "invited"  → Membership.status = "pending_user"
 *                                    (user must accept via /invitations)
 *   ClubUser.status === "disabled" → Membership.status = "deactivated"
 *   ClubUser.status === "draft"    → no Membership created (never invited)
 *
 * Idempotent: re-running skips ClubUser rows that already have an
 * equivalent Membership.
 *
 * Run with:
 *   node scripts/migrate-clubusers-to-memberships.js
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

const StrictlessSchema = new mongoose.Schema({}, { strict: false });

function statusMap(clubUserStatus) {
  switch (clubUserStatus) {
    case "active": return "active";
    case "invited": return "pending_user";
    case "disabled": return "deactivated";
    default: return null;
  }
}

async function makeUniqueUsername(User, base) {
  let candidate = base;
  let n = 1;
  while (await User.findOne({ username: candidate }).lean()) {
    candidate = `${base}${n}`;
    n += 1;
    if (n > 9999) throw new Error(`Could not find unique username for base "${base}"`);
  }
  return candidate;
}

async function run() {
  console.log("Connecting to MongoDB...");
  await mongoose.connect(MONGODB_URI);

  const ClubUser = mongoose.model("ClubUser", new mongoose.Schema({}, { strict: false, collection: "clubusers" }));
  const User = mongoose.model("User", new mongoose.Schema({}, { strict: false, collection: "users" }));
  const Membership = mongoose.model("Membership", new mongoose.Schema({}, { strict: false, collection: "memberships" }));

  // Match the partial-filter index strategy used by `seed-owner-users.js` so
  // null email/username values don't collide on uniqueness.
  await User.collection.createIndex(
    { username: 1 },
    { unique: true, partialFilterExpression: { username: { $type: "string" } } },
  );
  await User.collection.createIndex(
    { email: 1 },
    { unique: true, partialFilterExpression: { email: { $type: "string" } } },
  );
  await Membership.collection.createIndex({ userId: 1, clubId: 1 }, { unique: true });

  const clubUsers = await ClubUser.find({}).lean();
  console.log(`Found ${clubUsers.length} clubuser row(s)`);

  // Group by email so each unique human becomes one User.
  const byEmail = new Map();
  for (const cu of clubUsers) {
    if (!cu.email) continue;
    const key = String(cu.email).trim().toLowerCase();
    if (!byEmail.has(key)) byEmail.set(key, []);
    byEmail.get(key).push(cu);
  }

  let usersCreated = 0;
  let usersReused = 0;
  let membershipsCreated = 0;
  let membershipsSkipped = 0;
  let drafts = 0;

  for (const [email, group] of byEmail) {
    let user = await User.findOne({ email }).lean();
    if (!user) {
      const localPart = email.split("@")[0].replace(/[^a-z0-9]/g, "") || "user";
      const username = await makeUniqueUsername(User, localPart);
      const sample = group[0];
      const inserted = await User.create({
        email,
        username,
        firstName: sample.firstName || "",
        lastName: sample.lastName || "",
        phonePrefix: sample.phonePrefix || "+1",
        phone: sample.phone || "",
        password: sample.password || null,
        temporaryPassword: sample.temporaryPassword || null,
        mustChangePassword: !!sample.mustChangePassword,
        language: sample.language || "en",
        status: sample.password || sample.temporaryPassword ? "active" : "pending",
        isPlatformAdmin: false,
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      user = inserted.toObject();
      usersCreated++;
      console.log(`  Created User: ${email} (username: ${username})`);
    } else {
      usersReused++;
    }

    for (const cu of group) {
      const newStatus = statusMap(cu.status);
      if (!newStatus) {
        drafts++;
        continue;
      }
      const existing = await Membership.findOne({
        userId: user._id,
        clubId: cu.clubId,
      }).lean();
      if (existing) {
        membershipsSkipped++;
        continue;
      }
      await Membership.create({
        userId: user._id,
        clubId: cu.clubId,
        mainRole: cu.mainRole || "staff",
        customRoleLabel: cu.customRoleLabel || "",
        status: newStatus,
        invitedAt: cu.invitedAt || cu.createdAt || null,
        acceptedAt: cu.status === "active" ? (cu.invitedAt || cu.createdAt || new Date()) : null,
        deactivatedAt: cu.status === "disabled" ? (cu.updatedAt || new Date()) : null,
        teams: (cu.teams || []).map((t) => ({ teamId: t.teamId, role: t.role || "" })),
        lastChangedBy: "migration-script",
        createdAt: cu.createdAt || new Date(),
        updatedAt: new Date(),
      });
      membershipsCreated++;
    }
  }

  console.log(`\nDone.`);
  console.log(`  Users created: ${usersCreated}, reused: ${usersReused}`);
  console.log(`  Memberships created: ${membershipsCreated}, already-existed: ${membershipsSkipped}`);
  console.log(`  Draft ClubUser rows ignored: ${drafts}`);

  await mongoose.disconnect();
}

run().catch((err) => {
  console.error("Migration failed:", err);
  process.exit(1);
});
