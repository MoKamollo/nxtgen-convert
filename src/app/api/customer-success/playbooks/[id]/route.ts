import { and, desc, eq, sql } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { customerSuccessPlaybooks, customerSuccessPlaybookVersions } from "@/db/schema";
import { withApiGuard } from "@/lib/api-guard";
import { successPlaybookChecksum, validateSuccessPlaybookDefinition } from "@/lib/customer-success-playbooks";

async function GETHandler(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const organizationId = request.headers.get("x-tenant-id")!;
  const { id } = await params;
  const [playbook] = await db.select().from(customerSuccessPlaybooks).where(and(eq(customerSuccessPlaybooks.organizationId, organizationId), eq(customerSuccessPlaybooks.id, id))).limit(1);
  if (!playbook) return NextResponse.json({ error: "Playbook not found" }, { status: 404 });
  const versions = await db.select().from(customerSuccessPlaybookVersions).where(and(eq(customerSuccessPlaybookVersions.organizationId, organizationId), eq(customerSuccessPlaybookVersions.playbookId, id))).orderBy(desc(customerSuccessPlaybookVersions.version));
  return NextResponse.json({ data: { ...playbook, versions: versions.map((version) => ({ ...version, active: version.id === playbook.activeVersionId })) } });
}

async function PATCHHandler(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const organizationId = request.headers.get("x-tenant-id")!;
  const actorUserId = request.headers.get("x-user-id")!;
  const { id } = await params;
  const body = await request.json();
  const [playbook] = await db.select().from(customerSuccessPlaybooks).where(and(eq(customerSuccessPlaybooks.organizationId, organizationId), eq(customerSuccessPlaybooks.id, id))).limit(1);
  if (!playbook) return NextResponse.json({ error: "Playbook not found" }, { status: 404 });

  const updates: Record<string, unknown> = { updatedAt: new Date() };
  if (body.name !== undefined) {
    const name = String(body.name).trim().slice(0, 160);
    if (!name) return NextResponse.json({ error: "Playbook name is required" }, { status: 400 });
    updates.name = name;
  }
  if (body.description !== undefined) updates.description = body.description ? String(body.description).trim().slice(0, 2_000) : null;
  if (body.status !== undefined) {
    const status = String(body.status);
    if (!['paused', 'archived'].includes(status)) return NextResponse.json({ error: "Only paused or archived status may be set directly" }, { status: 400 });
    updates.status = status;
  }

  let draft = null;
  if (body.definition !== undefined) {
    let definition;
    try { definition = validateSuccessPlaybookDefinition(body.definition); }
    catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "Invalid playbook definition" }, { status: 400 }); }
    const checksum = successPlaybookChecksum(definition);
    const [duplicate] = await db.select().from(customerSuccessPlaybookVersions).where(and(
      eq(customerSuccessPlaybookVersions.organizationId, organizationId), eq(customerSuccessPlaybookVersions.playbookId, id), eq(customerSuccessPlaybookVersions.checksum, checksum),
    )).limit(1);
    if (duplicate) return NextResponse.json({ error: "This exact playbook definition already exists", version: duplicate.version }, { status: 409 });
    const [maxVersion] = await db.select({ value: sql<number>`COALESCE(MAX(${customerSuccessPlaybookVersions.version}), 0)` }).from(customerSuccessPlaybookVersions).where(and(eq(customerSuccessPlaybookVersions.organizationId, organizationId), eq(customerSuccessPlaybookVersions.playbookId, id)));
    [draft] = await db.insert(customerSuccessPlaybookVersions).values({
      organizationId, playbookId: id, version: Number(maxVersion?.value ?? 0) + 1, definition, checksum, status: "draft", createdByUserId: actorUserId,
    }).returning();
  }
  const [updated] = await db.update(customerSuccessPlaybooks).set(updates).where(and(eq(customerSuccessPlaybooks.organizationId, organizationId), eq(customerSuccessPlaybooks.id, id))).returning();
  return NextResponse.json({ data: { playbook: updated, draftVersion: draft } });
}

export const GET = withApiGuard(GETHandler);
export const PATCH = withApiGuard(PATCHHandler);
