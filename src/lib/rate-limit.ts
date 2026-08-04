import { pool } from "@/db";
import { hashSensitive } from "@/lib/request-security";

export type RateLimitDecision = { allowed: boolean; remaining: number; resetAt: Date };

export async function checkRateLimit(
  identifier: string,
  bucket: string,
  limit: number,
  windowSeconds: number,
): Promise<RateLimitDecision> {
  const now = Date.now();
  const windowNumber = Math.floor(now / (windowSeconds * 1000));
  const key = hashSensitive(`${identifier}:${bucket}:${windowNumber}`);
  const windowStart = new Date(windowNumber * windowSeconds * 1000);
  const resetAt = new Date(windowStart.getTime() + windowSeconds * 1000);

  const result = await pool.query<{ count: number }>(
    `INSERT INTO api_rate_limits (key, window_start, count, updated_at)
     VALUES ($1, $2, 1, now())
     ON CONFLICT (key) DO UPDATE SET count = api_rate_limits.count + 1, updated_at = now()
     RETURNING count`,
    [key, windowStart],
  );
  const count = Number(result.rows[0]?.count ?? 1);
  return { allowed: count <= limit, remaining: Math.max(0, limit - count), resetAt };
}
