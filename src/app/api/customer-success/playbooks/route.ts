import { and, desc, eq } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { customerSuccessPlaybooks, customerSuccessPlaybookVersions } from "@/db/schema";
import { withApiGuard } from "@/lib/api-guard";
import { successPlaybookChecksum, validateSuccessPlaybookDefinition } from "@/lib/customer-success-playbooks";

async function GETHandler(request: NextRequest) {
  const organizationId = request.headers.get("x-tenant-id")!;
  const rows = await db.select({
    id: customerSuccessPlaybooks.id,
    name: customerSuccessPlaybooks.name,
    description: customerSuccessPlaybooks.description,
    status: customerSuccessPlaybooks.status,
    activeVersionId: customerSuccessPlaybooks.activeVersionId,
    createdAt: customerSuccessPlaybooks.createdAt,
    updatedAt: customerSuccessPlaybooks.updatedAt,
    activeVersion: customerSuccessPlaybookVersions.version,
    definition: customerSuccessPlaybookVersions.definition,
    checksum: customerSuccessPlaybookVersions.checksum,
    publishedAt: customerSuccessPlaybookVersions.publishedAt,
  }).from(customerSuccessPlaybooks)
    .leftJoin(customerSuccessPlaybookVersions, and(
      eq(customerSuccessPlaybookVersions.organizationId, organizationId),
      eq(customerSuccessPlaybookVersions.id, customerSuccessPlaybooks.activeVersionId),
    ))
    .where(eq(customerSuccessPlaybooks.organizationId, organizationId))
    .orderBy(desc(customerSuccessPlaybooks.updatedAt));
  return NextResponse.json({ data: rows });
}

async function POSTHandler(request: NextRequest) {
  const organizationId = request.headers.get("x-tenant-id")!;
  const actorUserId = request.headers.get("x-user-id")!;
  const body = await request.json();
  const name = String(body.name ?? "").trim().slice(0, 160);
  if (!name) return NextResponse.json({ error: "Playbook name is required" }, { status: 400 });
  let definition;
  try { definition = validateSuccessPlaybookDefinition(body.definition); }
  catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "Invalid playbook definition" }, { status: 400 }); }
  const checksum = successPlaybookChecksum(definition);

  const result = await db.transaction(async (tx) => {
    const [playbook] = await tx.insert(customerSuccessPlaybooks).values({
      organizationId, name, description: body.description ? String(body.description).trim().slice(0, 2_000) : null,
      status: "draft", createdByUserId: actorUserId,
    }).returning();
    const [version] = await tx.insert(customerSuccessPlaybookVersions).values({
      organizationId, playbookId: playbook.id, version: 1, definition, checksum, status: "draft", createdByUserId: actorUserId,
    }).returning();
    return { playbook, version };
  });
  return NextResponse.json({ data: result }, { status: 201 });
}

export const GET = withApiGuard(GETHandler);
export const POST = withApiGuard(POSTHandler);
