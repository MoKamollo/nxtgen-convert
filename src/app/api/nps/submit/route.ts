import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { npsResponses } from "@/db/schema";
import { eq } from "drizzle-orm";
import { checkRateLimit } from "@/lib/rate-limit";
import { clientIp } from "@/lib/request-security";

// Public route — no auth header required
export async function POST(request: NextRequest) {
  const rate = await checkRateLimit(clientIp(request), "nps.submit", 30, 60 * 60);
  if (!rate.allowed) return NextResponse.json({ error: "Too many attempts" }, { status: 429 });
  const body = await request.json();
  if (!body.token || String(body.token).length > 256) return NextResponse.json({ error: "token required" }, { status: 400 });
  if (body.score === undefined || body.score === null) {
    return NextResponse.json({ error: "score required" }, { status: 400 });
  }
  const score = Number(body.score);
  if (!Number.isInteger(score) || score < 0 || score > 10) {
    return NextResponse.json({ error: "score must be 0–10" }, { status: 400 });
  }

  const [existing] = await db.select().from(npsResponses).where(eq(npsResponses.token, body.token)).limit(1);
  if (!existing) return NextResponse.json({ error: "Invalid survey link" }, { status: 404 });
  if (existing.submittedAt) return NextResponse.json({ error: "Already submitted" }, { status: 409 });

  await db.update(npsResponses).set({
    score,
    feedback: body.feedback ? String(body.feedback).trim().slice(0, 5000) : null,
    submittedAt: new Date(),
  }).where(eq(npsResponses.token, body.token));

  return NextResponse.json({ ok: true });
}

// GET — let the survey page read the token status
export async function GET(request: NextRequest) {
  const rate = await checkRateLimit(clientIp(request), "nps.read", 120, 60 * 60);
  if (!rate.allowed) return NextResponse.json({ error: "Too many attempts" }, { status: 429 });
  const token = new URL(request.url).searchParams.get("token");
  if (!token) return NextResponse.json({ error: "token required" }, { status: 400 });

  const [row] = await db.select({
    submittedAt: npsResponses.submittedAt,
    score: npsResponses.score,
  }).from(npsResponses).where(eq(npsResponses.token, token)).limit(1);

  if (!row) return NextResponse.json({ error: "Invalid link" }, { status: 404 });
  return NextResponse.json({ valid: true, alreadySubmitted: !!row.submittedAt });
}
