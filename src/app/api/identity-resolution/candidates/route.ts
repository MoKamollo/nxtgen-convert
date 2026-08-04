import { and, desc, eq } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { identityResolutionCandidates } from "@/db/schema";
import { withApiGuard } from "@/lib/api-guard";

export const GET = withApiGuard(async (request: NextRequest) => {
  const organizationId = request.headers.get("x-tenant-id")!;
  const status = request.nextUrl.searchParams.get("status") ?? "pending";
  const data = await db.select().from(identityResolutionCandidates).where(and(
    eq(identityResolutionCandidates.organizationId, organizationId),
    eq(identityResolutionCandidates.status, status),
  )).orderBy(desc(identityResolutionCandidates.createdAt)).limit(200);
  return NextResponse.json({
    data,
    methodology: "Candidates are deterministic exact identity conflicts. Confirming a match does not merge or delete either contact.",
  });
});
