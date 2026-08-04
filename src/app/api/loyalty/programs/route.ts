import { and, desc, eq } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { loyaltyPrograms, loyaltyProgramVersions } from "@/db/schema";
import { withApiGuard } from "@/lib/api-guard";
import { loyaltyProgramChecksum, validateLoyaltyProgramDefinition } from "@/lib/loyalty-programs";

async function GETHandler(request: NextRequest) {
  const organizationId = request.headers.get("x-tenant-id")!;
  const rows = await db.select({
    id: loyaltyPrograms.id, name: loyaltyPrograms.name, description: loyaltyPrograms.description, status: loyaltyPrograms.status,
    activeVersionId: loyaltyPrograms.activeVersionId, activeVersion: loyaltyProgramVersions.version, definition: loyaltyProgramVersions.definition,
    checksum: loyaltyProgramVersions.checksum, publishedAt: loyaltyProgramVersions.publishedAt, createdAt: loyaltyPrograms.createdAt, updatedAt: loyaltyPrograms.updatedAt,
  }).from(loyaltyPrograms).leftJoin(loyaltyProgramVersions, and(eq(loyaltyProgramVersions.organizationId, organizationId), eq(loyaltyProgramVersions.id, loyaltyPrograms.activeVersionId)))
    .where(eq(loyaltyPrograms.organizationId, organizationId)).orderBy(desc(loyaltyPrograms.updatedAt));
  return NextResponse.json({ data: rows });
}

async function POSTHandler(request: NextRequest) {
  const organizationId = request.headers.get("x-tenant-id")!;
  const actorUserId = request.headers.get("x-user-id")!;
  const body = await request.json();
  const name = String(body.name ?? "").trim().slice(0, 160);
  if (!name) return NextResponse.json({ error: "Program name is required" }, { status: 400 });
  let definition;
  try { definition = validateLoyaltyProgramDefinition(body.definition); }
  catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "Invalid loyalty program definition" }, { status: 400 }); }
  const checksum = loyaltyProgramChecksum(definition);
  const result = await db.transaction(async (tx) => {
    const [program] = await tx.insert(loyaltyPrograms).values({ organizationId, name, description: body.description ? String(body.description).trim().slice(0, 2_000) : null, status: "draft", createdByUserId: actorUserId }).returning();
    const [version] = await tx.insert(loyaltyProgramVersions).values({ organizationId, programId: program.id, version: 1, definition, checksum, status: "draft", createdByUserId: actorUserId }).returning();
    return { program, version };
  });
  return NextResponse.json({ data: result }, { status: 201 });
}

export const GET = withApiGuard(GETHandler);
export const POST = withApiGuard(POSTHandler);
