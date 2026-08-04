import { and, desc, eq } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { personalizationActiveVersions, personalizationExperiences, personalizationExperienceVersions } from "@/db/schema";
import { withApiGuard } from "@/lib/api-guard";
import { createPersonalizationVersion } from "@/lib/personalization";
async function GETHandler(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const organizationId = request.headers.get("x-tenant-id")!; const { id } = await params;
  const [experience] = await db.select().from(personalizationExperiences).where(and(eq(personalizationExperiences.organizationId, organizationId), eq(personalizationExperiences.id, id))).limit(1);
  if (!experience) return NextResponse.json({ error: "Experience not found" }, { status: 404 });
  const [versions, active] = await Promise.all([
    db.select().from(personalizationExperienceVersions).where(and(eq(personalizationExperienceVersions.organizationId, organizationId), eq(personalizationExperienceVersions.experienceId, id))).orderBy(desc(personalizationExperienceVersions.version)),
    db.select({ versionId: personalizationActiveVersions.versionId }).from(personalizationActiveVersions).where(and(eq(personalizationActiveVersions.organizationId, organizationId), eq(personalizationActiveVersions.experienceId, id))).limit(1),
  ]);
  return NextResponse.json({ data: experience, versions: versions.map((version) => ({ ...version, active: version.id === active[0]?.versionId })) });
}
async function PATCHHandler(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const organizationId = request.headers.get("x-tenant-id")!; const actorUserId = request.headers.get("x-user-id")!; const { id } = await params; const body = await request.json();
  const [experience] = await db.select().from(personalizationExperiences).where(and(eq(personalizationExperiences.organizationId, organizationId), eq(personalizationExperiences.id, id))).limit(1);
  if (!experience) return NextResponse.json({ error: "Experience not found" }, { status: 404 });
  try {
    const version = await createPersonalizationVersion({ organizationId, experienceId: id, definition: body.definition ?? experience.definition, actorUserId });
    const updates: Record<string, unknown> = { updatedAt: new Date() };
    for (const key of ["name", "description", "channel", "segmentId", "startsAt", "endsAt"]) if (body[key] !== undefined) updates[key] = body[key];
    if (body.status !== undefined) {
      const status = String(body.status);
      if (!["draft", "paused", "archived"].includes(status)) return NextResponse.json({ error: "Publish the experience to activate it" }, { status: 409 });
      updates.status = status;
    }
    if (updates.name !== undefined) updates.name = String(updates.name).slice(0, 150);
    if (updates.description !== undefined) updates.description = updates.description ? String(updates.description).slice(0, 2_000) : null;
    if (updates.startsAt) updates.startsAt = new Date(String(updates.startsAt));
    if (updates.endsAt) updates.endsAt = new Date(String(updates.endsAt));
    const [updated] = await db.update(personalizationExperiences).set(updates).where(and(eq(personalizationExperiences.organizationId, organizationId), eq(personalizationExperiences.id, id))).returning();
    return NextResponse.json({ data: updated, draftVersion: version.version });
  } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "Experience could not be updated" }, { status: 400 }); }
}
export const GET = withApiGuard(GETHandler);
export const PATCH = withApiGuard(PATCHHandler);
