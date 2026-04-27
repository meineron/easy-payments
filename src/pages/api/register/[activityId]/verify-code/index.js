import { verifyCode } from "@/lib/verification-codes";

async function _POST(req, res) {
  try {
    const { email, code } = req.body;
    if (!email || !code) {
      return res.status(400).json({ error: "Email and code are required" });
    }

    const result = verifyCode(email.trim().toLowerCase(), code);
    if (!result.valid) {
      return res.status(400).json({ error: result.error });
    }

    return res.status(200).json({ success: true, verified: true });
  } catch (error) {
    console.error("Verify code error:", error);
    return res.status(500).json({ error: "Failed to verify code" });
  }
}
export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  return _POST(req, res);
}
