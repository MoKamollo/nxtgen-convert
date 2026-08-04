import { NextRequest, NextResponse } from "next/server";
import { createHmac, timingSafeEqual } from "crypto";
import { db } from "@/db";
import {
  organizations,
  users,
  contacts,
  deals,
  campaigns,
  orders,
  subscriptions,
} from "@/db/schema";
import { count, max, eq, sql } from "drizzle-orm";

const REPLAY_WINDOW_S = 60;

function hmacValid(request: NextRequest): boolean {
  const key = process.env.NCC_CONVERT_HMAC_KEY ?? "";
  if (key.length < 32) return false;
  const ts = request.headers.get("x-ncc-timestamp") ?? "";
  const sig = request.headers.get("x-ncc-signature") ?? "";
  if (!ts || !sig) return false;
  const tsNum = parseInt(ts, 10);
  if (isNaN(tsNum) || Math.abs(Date.now() / 1000 - tsNum) > REPLAY_WINDOW_S) return false;
  const expected = createHmac("sha256", key).update(`ncc-convert:${ts}`).digest("hex");
  try {
    return timingSafeEqual(Buffer.from(expected, "hex"), Buffer.from(sig.padEnd(expected.length, "0"), "hex")) &&
      sig.length === expected.length;
  } catch {
    return false;
  }
}

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  if (!hmacValid(request)) {
    return NextResponse.json({ error: "Unauthorized" }, {
      status: 401,
      headers: { "Cache-Control": "no-store" },
    });
  }

  // Provider presence — boolean only, key values never returned
  const email    = (process.env.RESEND_API_KEY   ?? "").length > 0;
  const groq     = (process.env.GROQ_API_KEY     ?? "").length > 0;
  const space    = (process.env.SPACE_SSO_SECRET  ?? "").length > 0;
  const spaceApi = (process.env.SPACE_API_SECRET  ?? "").length > 0;
  const brain    = (process.env.BRAIN_SERVICE_TOKEN ?? "").length > 0;

  let dbStatus = "error";
  let counts = {
    organizations: 0, users: 0, contacts: 0,
    deals: 0, campaigns: 0, orders: 0, crm_active_subscriptions: 0,
  };
  let lastContactAt: string | null = null;
  let lastDealAt: string | null = null;

  try {
    await db.execute(sql`SELECT 1`);
    dbStatus = "connected";

    const [orgR, userR, contactR, dealR, campaignR, orderR, subR, lcR, ldR] = await Promise.all([
      db.select({ n: count() }).from(organizations),
      db.select({ n: count() }).from(users),
      db.select({ n: count() }).from(contacts),
      db.select({ n: count() }).from(deals),
      db.select({ n: count() }).from(campaigns),
      db.select({ n: count() }).from(orders),
      db.select({ n: count() }).from(subscriptions).where(eq(subscriptions.status, "active")),
      db.select({ at: max(contacts.createdAt) }).from(contacts),
      db.select({ at: max(deals.updatedAt) }).from(deals),
    ]);

    counts = {
      organizations:      orgR[0]?.n ?? 0,
      users:              userR[0]?.n ?? 0,
      contacts:           contactR[0]?.n ?? 0,
      deals:              dealR[0]?.n ?? 0,
      campaigns:          campaignR[0]?.n ?? 0,
      orders:             orderR[0]?.n ?? 0,
      crm_active_subscriptions: subR[0]?.n ?? 0,
    };
    lastContactAt = lcR[0]?.at?.toISOString() ?? null;
    lastDealAt    = ldR[0]?.at?.toISOString() ?? null;
  } catch {
    // intentional — partial data already set above
  }

  return NextResponse.json(
    {
      status:          "ok",
      service:         "NxtGen Convergence",
      version:         "1.0.0",
      database:        dbStatus,
      stripe:          "NOT_OPERATIONAL",
      billing:         "NOT_OPERATIONAL",
      email,
      groq,
      space,
      space_api:       spaceApi,
      brain,
      counts,
      last_contact_at: lastContactAt,
      last_deal_at:    lastDealAt,
      timestamp:       new Date().toISOString(),
    },
    { headers: { "Cache-Control": "no-store", "X-Robots-Tag": "noindex, nofollow" } }
  );
}

export async function POST() {
  return NextResponse.json({ error: "Method not allowed" }, { status: 405 });
}
