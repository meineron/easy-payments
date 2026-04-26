// Slug-based naming for per-club tenant databases.
//
// The current convention is `club_<slug>` where `<slug>` is derived from the
// club's display name. Examples:
//   "Aspire FC"        → club_aspire_fc
//   "Tampa Rangers"    → club_tampa_rangers
//   "FC Barcelona '99" → club_fc_barcelona_99
//
// If the slug is empty (e.g. an all-non-ASCII / Hebrew name) or already taken
// by another club, we append the last 4 characters of the club's `_id` to
// guarantee uniqueness without scanning collisions repeatedly:
//   "מכבי תל אביב" + _id …d21c → club_d21c
//   second "Aspire FC" + _id …a40  → club_aspire_fc_a40
//
// IMPORTANT: dbName is stamped at club creation time and must NEVER be
// recomputed afterwards. Renaming a club doesn't rename its database;
// renaming a Mongo DB requires a physical dump+restore (see comments in
// `src/lib/mongodb.js`).

const PREFIX = "club_";

// MongoDB reserved / system database names. Avoid clashing with these even
// if a slug happens to match.
const RESERVED_DB_NAMES = new Set(["admin", "local", "config"]);

// MongoDB DB name max length (Linux/macOS). Pick a conservative ceiling so we
// always have headroom for the optional id suffix.
const MAX_LEN = 60;

export function slugifyClubName(name) {
  return String(name || "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "") // strip combining accents
    .replace(/[^a-zA-Z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .toLowerCase()
    .slice(0, MAX_LEN - PREFIX.length - 5); // leave room for "_xxxx" suffix
}

function shortIdSuffix(idLike) {
  const s = String(idLike || "");
  return s.slice(-4) || "x";
}

// Resolve the final dbName for a club, given its display name and `_id`.
// `mainConn` is a mongoose Connection (the main/shared DB connection); we use
// it to check whether a candidate name is already taken by another club.
//
// Returns a string like "club_aspire_fc" or "club_aspire_fc_a40".
export async function generateClubDbName({ name, _id, mainConn }) {
  const slug = slugifyClubName(name);
  const suffix = shortIdSuffix(_id);

  // Empty slug → fall back to id-based name (no readable component to use).
  if (!slug) return `${PREFIX}${suffix}`;

  const candidate = `${PREFIX}${slug}`;

  // Reserved or already-claimed → disambiguate with id suffix.
  const isReserved = RESERVED_DB_NAMES.has(candidate);
  let alreadyUsed = false;
  if (!isReserved && mainConn) {
    const existing = await mainConn.collection("clubs").findOne(
      { dbName: candidate, _id: { $ne: _id } },
      { projection: { _id: 1 } },
    );
    alreadyUsed = !!existing;
  }

  if (isReserved || alreadyUsed) {
    return `${PREFIX}${slug}_${suffix}`;
  }
  return candidate;
}
