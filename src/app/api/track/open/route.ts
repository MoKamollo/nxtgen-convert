import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { campaigns } from "@/db/schema";
import { eq } from "drizzle-orm";

// 1×1 transparent GIF — served without hitting any CDN cache
const PIXEL = Buffer.from(
  "R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7",
  "base64"
);

export async function GET(request: NextRequest) {
  const campaignId = request.nextUrl.searchParams.get("c");

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
          .set({ stats: { ...stats, opened: (stats.opened ?? 0) + 1 } })
          .where(eq(campaigns.id, campaignId));
      }
    } catch { /* never block pixel delivery on DB errors */ }
  }

  return new NextResponse(PIXEL, {
    status: 200,
    headers: {
      "Content-Type": "image/gif",
      "Cache-Control": "no-store, no-cache, must-revalidate",
      "Pragma": "no-cache",
      "Expires": "0",
    },
  });
}
