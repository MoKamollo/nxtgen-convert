import { and, desc, eq, sql } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { loyaltyPrograms, loyaltyProgramVersions, loyaltyTiers } from "@/db/schema";
import { withApiGuard } from "@/lib/api-guard";
import { loyaltyProgramChecksum, validateLoyaltyProgramDefinition } from "@/lib/loyalty-programs";

async function GETHandler(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const organizationId = request.headers.get("x-tenant-id")!;
  const { id } = await params;
  const [program] = await db.select().from(loyaltyPrograms).where(and(eq(loyaltyPrograms.organizationId, organizationId), eq(loyaltyPrograms.id, id))).limit(1);
  if (!program) return NextResponse.json({ error: "Loyalty program not found" }, { status: 404 });
  const versions = await db.select().from(loyaltyProgramVersions).where(and(eq(loyaltyProgramVersions.organizationId, organizationId), eq(loyaltyProgramVersions.programId, id))).orderBy(desc(loyaltyProgramVersions.version));
  const tiers = await db.select().from(loyaltyTiers).where(eq(loyaltyTiers.organizationId, organizationId)).orderBy(loyaltyTiers.sequence);
  return NextResponse.json({ data: { ...program, versions: versions.map((version) => ({ ...version, active: version.id === program.activeVersionId, tiers: tiers.filter((tier) => tier.programVersionId === version.id) })) } });
}

async function PATCHHandler(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const organizationId = request.headers.get("x-tenant-id")!;
  const actorUserId = request.headers.get("x-user-id")!;
  const { id } = await params;
  const body = await request.json();
  const [program] = await db.select().from(loyaltyPrograms).where(and(eq(loyaltyPrograms.organizationId, organizationId), eq(loyaltyPrograms.id, id))).limit(1);
  if (!program) return NextResponse.json({ error: "Loyalty program not found" }, { status: 404 });
  const updates: Record<string, unknown> = { updatedAt: new Date() };
  if (body.name !== undefined) {
    const name = String(body.name).trim().slice(0, 160);
    if (!name) return NextResponse.json({ error: "Program name is required" }, { status: 400 });
    updates.name = name;
  }
  if (body.description !== undefined) updates.description = body.description ? String(body.description).trim().slice(0, 2_000) : null;
  if (body.status !== undefined) {
    const status = String(body.status);
    if (!["paused", "archived"].includes(status)) return NextResponse.json({ error: "Only paused or archived status may be set directly" }, { status: 400 });
    updates.status = status;
  }
  let draft = null;
  if (body.definition !== undefined) {
    let definition;
    try { definition = validateLoyaltyProgramDefinition(body.definition); }
    catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "Invalid loyalty program definition" }, { status: 400 }); }
    const checksum = loyaltyProgramChecksum(definition);
    const [duplicate] = await db.select().from(loyaltyProgramVersions).where(and(eq(loyaltyProgramVersions.organizationId, organizationId), eq(loyaltyProgramVersions.programId, id), eq(loyaltyProgramVersions.checksum, checksum))).limit(1);
    if (duplicate) return NextResponse.json({ error: "This exact program definition already exists", version: duplicate.version }, { status: 409 });
    const [maximum] = await db.select({ value: sql<number>`COALESCE(MAX(${loyaltyProgramVersions.version}), 0)` }).from(loyaltyProgramVersions).where(and(eq(loyaltyProgramVersions.organizationId, organizationId), eq(loyaltyProgramVersions.programId, id)));
    [draft] = await db.insert(loyaltyProgramVersions).values({ organizationId, programId: id, version: Number(maximum?.value ?? 0) + 1, definition, checksum, status: "draft", createdByUserId: actorUserId }).returning();
  }
  const [updated] = await db.update(loyaltyPrograms).set(updates).where(and(eq(loyaltyPrograms.organizationId, organizationId), eq(loyaltyPrograms.id, id))).returning();
  return NextResponse.json({ data: { program: updated, draftVersion: draft } });
}

export const GET = withApiGuard(GETHandler);
export const PATCH = withApiGuard(PATCHHandler);
