import { desc, eq } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { loyaltyFraudReviews } from "@/db/schema";
import { withApiGuard } from "@/lib/api-guard";
async function GETHandler(request: NextRequest) {
  const organizationId = request.headers.get("x-tenant-id")!;
  const rows = await db.select().from(loyaltyFraudReviews).where(eq(loyaltyFraudReviews.organizationId, organizationId)).orderBy(desc(loyaltyFraudReviews.createdAt)).limit(500);
  return NextResponse.json({ data: rows });
}
export const GET = withApiGuard(GETHandler);
