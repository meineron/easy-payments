import PublicLookup from "@/models/PublicLookup";

// Records a (kind, key) → clubId mapping that lets unauthenticated public
// requests resolve which club's database holds the underlying document.
//
// Idempotent: re-recording the same (kind, key) just updates `clubId` (which
// should be stable for a given key, but the upsert protects us against
// races / retries).
//
// Call this from every place that creates a publicly-addressable document:
//   - Activity creation       → recordPublicLookup("activity", String(activity._id), clubId)
//   - Order paymentToken set  → recordPublicLookup("paymentToken", token, clubId)
//   - Order registrationToken → recordPublicLookup("registrationToken", token, clubId)
//   - PaymentRequest.paymentToken → recordPublicLookup("paymentToken", token, clubId)
//   - Lead creation           → recordPublicLookup("leadSlug", slug, clubId)
export async function recordPublicLookup(kind, key, clubId) {
  if (!kind || !key || !clubId) return null;
  try {
    return await PublicLookup.updateOne(
      { kind, key: String(key) },
      { $set: { kind, key: String(key), clubId } },
      { upsert: true },
    );
  } catch (err) {
    // Best-effort: a failure here MUST NOT abort the parent request because
    // public-flow routing only kicks in for migrated clubs (`PublicLookup`
    // is a no-op until then).
    console.error(`[publicLookup] failed for ${kind}/${key}:`, err.message);
    return null;
  }
}

// Resolve a public key to its clubId. Returns null when the key is unknown.
// Must be called BEFORE opening a tenant connection.
export async function resolveClubIdByPublicKey(kind, key) {
  if (!kind || !key) return null;
  const row = await PublicLookup.findOne({ kind, key: String(key) }).select("clubId").lean();
  return row ? String(row.clubId) : null;
}
