import { withApiGuard } from "@/lib/api-guard";
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { campaigns } from "@/db/schema";
import { desc, eq } from "drizzle-orm";
import {
  addCampaignStats,
  emptyCampaignStats,
  normalizeCampaignStats,
  percentage,
} from "@/lib/campaign-analytics";

async function GETHandler(request: NextRequest) {
  const orgId = request.headers.get("x-tenant-id");
  if (!orgId) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  try {
    const rows = await db.select()
      .from(campaigns)
      .where(eq(campaigns.organizationId, orgId))
      .orderBy(desc(campaigns.sentAt));

    const data = rows.map((campaign) => ({
      ...campaign,
      normalizedStats: normalizeCampaignStats(campaign.stats),
    }));
    const totals = data.reduce(
      (aggregate, campaign) => addCampaignStats(aggregate, campaign.normalizedStats),
      emptyCampaignStats(),
    );

    return NextResponse.json({
      data: {
        campaigns: data,
        totals,
        avgOpenRate: percentage(totals.opened, totals.delivered || totals.sent),
        avgClickRate: percentage(totals.clicked, totals.delivered || totals.sent),
        avgBounceRate: percentage(totals.bounced, totals.sent),
      },
    });
  } catch {
    return NextResponse.json({ error: "Failed to fetch campaign analytics" }, { status: 500 });
  }
}

export const GET = withApiGuard(GETHandler);
