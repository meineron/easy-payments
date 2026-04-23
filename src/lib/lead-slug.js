import crypto from "crypto";
import Lead from "@/models/Lead";

const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";

function randomSlug(length = 10) {
  const bytes = crypto.randomBytes(length);
  let s = "";
  for (let i = 0; i < length; i++) {
    s += ALPHABET[bytes[i] % ALPHABET.length];
  }
  return s;
}

export async function generateUniqueLeadSlug(length = 10, maxAttempts = 8) {
  for (let i = 0; i < maxAttempts; i++) {
    const slug = randomSlug(length);
    const existing = await Lead.exists({ slug });
    if (!existing) return slug;
  }
  return `${randomSlug(length)}${Date.now().toString(36)}`;
}
