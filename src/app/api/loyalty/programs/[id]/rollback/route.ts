import { and, eq } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { loyaltyPrograms, loyaltyProgramVersions } from "@/db/schema";
import { withApiGuard } from "@/lib/api-guard";
async function POSTHandler(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const organizationId = request.headers.get("x-tenant-id")!;
  const { id } = await params;
  const body = await request.json().catch(() => ({}));
  const versionId = String(body.versionId ?? "");
  const [version] = await db.select().from(loyaltyProgramVersions).where(and(eq(loyaltyProgramVersions.organizationId, organizationId), eq(loyaltyProgramVersions.programId, id), eq(loyaltyProgramVersions.id, versionId), eq(loyaltyProgramVersions.status, "published"))).limit(1);
  if (!version) return NextResponse.json({ error: "Published program version not found" }, { status: 404 });
  const [program] = await db.update(loyaltyPrograms).set({ activeVersionId: versionId, status: "active", updatedAt: new Date() }).where(and(eq(loyaltyPrograms.organizationId, organizationId), eq(loyaltyPrograms.id, id))).returning();
  if (!program) return NextResponse.json({ error: "Loyalty program not found" }, { status: 404 });
  return NextResponse.json({ data: { program, version } });
}
export const POST = withApiGuard(POSTHandler);
