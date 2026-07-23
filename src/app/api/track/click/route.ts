import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { campaigns } from "@/db/schema";
import { eq } from "drizzle-orm";

export async function GET(request: NextRequest) {
  const campaignId = request.nextUrl.searchParams.get("c");
  const rawUrl     = request.nextUrl.searchParams.get("url");

  if (campaignId) {
    try {
      const [row] = await db
        .select({ stats: campaigns.stats })
        .from(campaigns)
        .where(eq(campaigns.id, campaignId))
        .limit(1);

      if (row) {
        const stats = (row.stats ?? {}) as Record<string, number>;
        await db
          .update(campaigns)
          .set({ stats: { ...stats, clicked: (stats.clicked ?? 0) + 1 } })
          .where(eq(campaigns.id, campaignId));
      }
    } catch { /* never block redirect on DB errors */ }
  }

  // Validate destination — must be http/https or relative
  let destination = "/";
  if (rawUrl) {
    try {
      const decoded = decodeURIComponent(rawUrl);
      if (decoded.startsWith("http://") || decoded.startsWith("https://") || decoded.startsWith("/")) {
        destination = decoded;
      }
    } catch { /* invalid URL — fall back to home */ }
  }

  return NextResponse.redirect(destination, { status: 302 });
}
