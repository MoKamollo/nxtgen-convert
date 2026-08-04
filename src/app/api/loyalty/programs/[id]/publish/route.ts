import { and, eq } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { loyaltyPrograms, loyaltyProgramVersions, loyaltyTiers } from "@/db/schema";
import { withApiGuard } from "@/lib/api-guard";
import { validateLoyaltyProgramDefinition } from "@/lib/loyalty-programs";

async function POSTHandler(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const organizationId = request.headers.get("x-tenant-id")!;
  const { id } = await params;
  const body = await request.json().catch(() => ({}));
  const versionId = String(body.versionId ?? "");
  if (!versionId) return NextResponse.json({ error: "versionId is required" }, { status: 400 });
  const [version] = await db.select().from(loyaltyProgramVersions).where(and(eq(loyaltyProgramVersions.organizationId, organizationId), eq(loyaltyProgramVersions.programId, id), eq(loyaltyProgramVersions.id, versionId))).limit(1);
  if (!version) return NextResponse.json({ error: "Program version not found" }, { status: 404 });
  if (version.status !== "draft") return NextResponse.json({ error: "Only a draft version may be published" }, { status: 409 });
  let definition;
  try { definition = validateLoyaltyProgramDefinition(version.definition); }
  catch { return NextResponse.json({ error: "Stored draft definition is invalid" }, { status: 409 }); }
  const now = new Date();
  const result = await db.transaction(async (tx) => {
    const [published] = await tx.update(loyaltyProgramVersions).set({ status: "published", publishedAt: now }).where(and(eq(loyaltyProgramVersions.organizationId, organizationId), eq(loyaltyProgramVersions.id, versionId), eq(loyaltyProgramVersions.status, "draft"))).returning();
    if (!published) throw new Error("Version could not be published");
    await tx.insert(loyaltyTiers).values(definition.tiers.map((tier, index) => ({ organizationId, programVersionId: versionId, name: tier.name, minimumLifetimePoints: tier.minimumLifetimePoints, benefits: tier.benefits, sequence: index + 1 })));
    const [program] = await tx.update(loyaltyPrograms).set({ activeVersionId: versionId, status: "active", updatedAt: now }).where(and(eq(loyaltyPrograms.organizationId, organizationId), eq(loyaltyPrograms.id, id))).returning();
    if (!program) throw new Error("Loyalty program not found");
    return { program, version: published };
  });
  return NextResponse.json({ data: result });
}
export const POST = withApiGuard(POSTHandler);
