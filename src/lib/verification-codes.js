const verificationCodes = new Map();

export function storeCode(email, code) {
  verificationCodes.set(email.toLowerCase().trim(), {
    code,
    expiresAt: Date.now() + 10 * 60 * 1000,
  });
}

export function verifyCode(email, code) {
  const key = email.toLowerCase().trim();
  const stored = verificationCodes.get(key);
  if (!stored) return { valid: false, error: "No code found. Please request a new one." };
  if (Date.now() > stored.expiresAt) {
    verificationCodes.delete(key);
    return { valid: false, error: "Code expired. Please request a new one." };
  }
  if (stored.code !== code.trim()) return { valid: false, error: "Invalid code" };
  verificationCodes.delete(key);
  return { valid: true };
}

export function generateCode() {
  return String(Math.floor(100000 + Math.random() * 900000));
}
