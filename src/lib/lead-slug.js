import crypto from "crypto";
import { connectMain } from "@/lib/mongodb";
import PublicLookup from "@/models/PublicLookup";

const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";

function randomSlug(length = 10) {
  const bytes = crypto.randomBytes(length);
  let s = "";
  for (let i = 0; i < length; i++) {
    s += ALPHABET[bytes[i] % ALPHABET.length];
  }
  return s;
}

// Uniqueness is enforced by the global PublicLookup index, which lives in the
// main DB and indexes lead slugs across all tenants.
export async function generateUniqueLeadSlug(length = 10, maxAttempts = 8) {
  await connectMain();
  for (let i = 0; i < maxAttempts; i++) {
    const slug = randomSlug(length);
    const existing = await PublicLookup.exists({ kind: "leadSlug", key: slug });
    if (!existing) return slug;
  }
  return `${randomSlug(length)}${Date.now().toString(36)}`;
}
