import mongoose from "mongoose";

const MONGODB_URI = process.env.MONGODB_URI;

if (!MONGODB_URI) {
  throw new Error("Please define the MONGODB_URI environment variable in .env.local");
}

let cached = global.mongoose;

if (!cached) {
  cached = global.mongoose = { conn: null, promise: null };
}

// Connects to the main (shared) database. This is the database `MONGODB_URI`
// points at — the home of `Club`, `User`, `Membership`, `Exercise`, `PublicLookup`,
// `MigrationLog`, and (during legacy/migrating) every tenant collection.
export default async function dbConnect() {
  if (cached.conn) {
    return cached.conn;
  }

  if (!cached.promise) {
    cached.promise = mongoose.connect(MONGODB_URI).then((mongoose) => mongoose);
  }

  cached.conn = await cached.promise;
  return cached.conn;
}

// Alias with a clearer name for the multi-tenant world.
export async function connectMain() {
  await dbConnect();
  return mongoose.connection;
}

// Returns a mongoose connection scoped to a specific club's own database.
// Built on top of `useDb({ useCache: true })` so the underlying socket pool
// is shared with the main connection — per-club connections are essentially free.
export async function connectClub(clubId) {
  const main = await connectMain();
  const dbName = `club_${String(clubId)}`;
  return main.useDb(dbName, { useCache: true });
}

// Routes a tenant data request to the right database based on the club's
// current `migrationStatus`:
//
//   legacy    → primary = main connection,  shadow = null         (today's behavior)
//   migrating → primary = main connection,  shadow = club DB      (writes go to both; reads from main)
//   migrated  → primary = club DB,          shadow = null
//
// The caller obtains tenant models from `primary` for reads and writes; if
// `shadow` is non-null, the caller mirrors writes into it best-effort and
// logs failures to MigrationLog. Reads always come from `primary` to guarantee
// consistency mid-migration.
//
// Note: this function does NOT enforce auth or membership — that happens upstream
// in `src/lib/club-context.js`. Public flows (Stripe webhook, /register/...)
// resolve a clubId via metadata or `PublicLookup` and call this directly.
export async function getTenantConn(clubId) {
  if (!clubId) throw new Error("getTenantConn requires a clubId");
  const main = await connectMain();

  // Resolve the club's migration status. We look it up on the main connection's
  // `clubs` collection directly to avoid a Mongoose model import cycle (this
  // module is loaded by everything).
  const clubDoc = await main.collection("clubs").findOne(
    { _id: typeof clubId === "string" ? toObjectIdSafe(clubId) : clubId },
    { projection: { migrationStatus: 1, dbName: 1, status: 1 } },
  );

  if (!clubDoc) throw new Error(`Club not found: ${clubId}`);

  const dbName = clubDoc.dbName || `club_${String(clubId)}`;
  const status = clubDoc.migrationStatus || "legacy";
  const lifecycleStatus = clubDoc.status || "active";

  if (status === "migrated") {
    return {
      primary: main.useDb(dbName, { useCache: true }),
      shadow: null,
      status,
      lifecycleStatus,
      clubId: String(clubId),
      dbName,
    };
  }

  if (status === "migrating") {
    return {
      primary: main,
      shadow: main.useDb(dbName, { useCache: true }),
      status,
      lifecycleStatus,
      clubId: String(clubId),
      dbName,
    };
  }

  return {
    primary: main,
    shadow: null,
    status,
    lifecycleStatus,
    clubId: String(clubId),
    dbName,
  };
}

function toObjectIdSafe(idStr) {
  try {
    return new mongoose.Types.ObjectId(idStr);
  } catch {
    return null;
  }
}
