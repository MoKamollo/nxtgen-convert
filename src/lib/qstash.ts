import { createHash, createHmac, timingSafeEqual } from "node:crypto";

type QStashClaims = {
  iss?: string;
  sub?: string;
  exp?: number;
  nbf?: number;
  body?: string;
};

function safeEqual(left: string, right: string) {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
}

function verifyWithKey(signature: string, signingKey: string, rawBody: string, url: string) {
  const parts = signature.split(".");
  if (parts.length !== 3) throw new Error("Invalid QStash signature");
  const [header, payload, signed] = parts;
  const expected = createHmac("sha256", signingKey)
    .update(`${header}.${payload}`)
    .digest("base64url");
  if (!safeEqual(signed, expected)) throw new Error("Invalid QStash signature");

  const claims = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as QStashClaims;
  const now = Math.floor(Date.now() / 1000);
  if (claims.iss !== "Upstash") throw new Error("Invalid QStash issuer");
  if (claims.sub !== url) throw new Error("Invalid QStash destination");
  if (!claims.exp || now > claims.exp) throw new Error("Expired QStash signature");
  if (claims.nbf && now < claims.nbf) throw new Error("QStash signature is not active");
  const bodyHash = createHash("sha256").update(rawBody).digest("base64url");
  if ((claims.body ?? "").replace(/=+$/, "") !== bodyHash) {
    throw new Error("QStash body hash mismatch");
  }
}

export function verifyQStashRequest(signature: string | null, rawBody: string, url: string) {
  if (!signature) throw new Error("Missing QStash signature");
  const keys = [
    process.env.QSTASH_CURRENT_SIGNING_KEY,
    process.env.QSTASH_NEXT_SIGNING_KEY,
  ].filter((value): value is string => Boolean(value));
  if (keys.length === 0) throw new Error("QStash signing keys are not configured");

  let lastError: unknown;
  for (const key of keys) {
    try {
      verifyWithKey(signature, key, rawBody, url);
      return;
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError instanceof Error ? lastError : new Error("Invalid QStash request");
}

export async function publishQStashMessage(options: {
  destination: string;
  body: unknown;
  notBefore: Date;
}) {
  const token = process.env.QSTASH_TOKEN;
  if (!token) throw new Error("QSTASH_TOKEN is not configured");
  if (!process.env.QSTASH_CURRENT_SIGNING_KEY || !process.env.QSTASH_NEXT_SIGNING_KEY) {
    throw new Error("QStash signing keys are not configured");
  }

  const response = await fetch(
    `https://qstash.upstash.io/v2/publish/${encodeURIComponent(options.destination)}`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        "Upstash-Not-Before": String(Math.floor(options.notBefore.getTime() / 1000)),
        "Upstash-Retries": "3",
      },
      body: JSON.stringify(options.body),
      cache: "no-store",
    },
  );
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(
      typeof payload.error === "string"
        ? payload.error
        : `QStash scheduling failed with status ${response.status}`,
    );
  }
  return payload as { messageId?: string; deduplicated?: boolean };
}
