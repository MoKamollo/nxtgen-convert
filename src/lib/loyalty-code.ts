import { createHmac, randomBytes } from "crypto";

function secret() {
  const value = process.env.LOYALTY_CODE_HASHING_SECRET;
  if (!value || value.length < 32) throw new Error("LOYALTY_CODE_HASHING_SECRET must be configured with at least 32 characters");
  return value;
}
export function createReferralCode() { return `ref_${randomBytes(18).toString("base64url")}`; }
export function hashReferralCode(code: string) { return createHmac("sha256", secret()).update(code.trim()).digest("hex"); }
export function referralCodeHint(code: string) { return `${code.slice(0, 8)}…${code.slice(-4)}`; }
