import { and, desc, eq } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { customerSegmentActiveVersions, customerSegments, customerSegmentVersions } from "@/db/schema";
import { withApiGuard } from "@/lib/api-guard";
import { countSegmentMembers, createSegmentVersion } from "@/lib/segments";
import { validateSegmentDefinition } from "@/lib/segment-definition";

async function GETHandler(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const organizationId = request.headers.get("x-tenant-id")!;
  const { id } = await params;
  const [segment] = await db.select().from(customerSegments).where(and(eq(customerSegments.organizationId, organizationId), eq(customerSegments.id, id))).limit(1);
  if (!segment) return NextResponse.json({ error: "Segment not found" }, { status: 404 });
  const [versions, active, memberCount] = await Promise.all([
    db.select().from(customerSegmentVersions).where(and(eq(customerSegmentVersions.organizationId, organizationId), eq(customerSegmentVersions.segmentId, id))).orderBy(desc(customerSegmentVersions.version)),
    db.select({ versionId: customerSegmentActiveVersions.versionId }).from(customerSegmentActiveVersions).where(and(eq(customerSegmentActiveVersions.organizationId, organizationId), eq(customerSegmentActiveVersions.segmentId, id))).limit(1),
    countSegmentMembers(organizationId, validateSegmentDefinition(segment.definition)),
  ]);
  return NextResponse.json({ data: segment, memberCount, versions: versions.map((version) => ({ ...version, active: version.id === active[0]?.versionId })) });
}

async function PATCHHandler(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const organizationId = request.headers.get("x-tenant-id")!;
  const actorUserId = request.headers.get("x-user-id")!;
  const { id } = await params;
  const body = await request.json();
  const [segment] = await db.select().from(customerSegments).where(and(eq(customerSegments.organizationId, organizationId), eq(customerSegments.id, id))).limit(1);
  if (!segment) return NextResponse.json({ error: "Segment not found" }, { status: 404 });
  try {
    const definition = body.definition ?? segment.definition;
    const version = await createSegmentVersion({ organizationId, segmentId: id, definition, actorUserId });
    const updates: Record<string, unknown> = { updatedAt: new Date() };
    if (body.name !== undefined) updates.name = String(body.name).trim().slice(0, 150);
    if (body.description !== undefined) updates.description = body.description ? String(body.description).slice(0, 2_000) : null;
    if (body.status === "archived") updates.status = "archived";
    const [updated] = await db.update(customerSegments).set(updates).where(and(eq(customerSegments.organizationId, organizationId), eq(customerSegments.id, id))).returning();
    return NextResponse.json({ data: updated, draftVersion: version.version });
  } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "Segment could not be updated" }, { status: 400 }); }
}

export const GET = withApiGuard(GETHandler);
export const PATCH = withApiGuard(PATCHHandler);
