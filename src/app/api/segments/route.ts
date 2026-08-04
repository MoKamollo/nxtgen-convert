import { asc, eq } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { customerSegments } from "@/db/schema";
import { withApiGuard } from "@/lib/api-guard";
import { countSegmentMembers, createSegmentDraft } from "@/lib/segments";
import { validateSegmentDefinition } from "@/lib/segment-definition";

async function GETHandler(request: NextRequest) {
  const organizationId = request.headers.get("x-tenant-id")!;
  const rows = await db.select().from(customerSegments).where(eq(customerSegments.organizationId, organizationId)).orderBy(asc(customerSegments.name));
  const data = await Promise.all(rows.map(async (segment) => ({ ...segment, memberCount: await countSegmentMembers(organizationId, validateSegmentDefinition(segment.definition)) })));
  return NextResponse.json({ data });
}

async function POSTHandler(request: NextRequest) {
  const organizationId = request.headers.get("x-tenant-id")!;
  const actorUserId = request.headers.get("x-user-id")!;
  const body = await request.json();
  const name = String(body.name ?? "").trim().slice(0, 150);
  if (!name) return NextResponse.json({ error: "Segment name is required" }, { status: 400 });
  try {
    const created = await createSegmentDraft({ organizationId, name, description: body.description ? String(body.description).slice(0, 2_000) : null, definition: body.definition ?? { combinator: "and", conditions: [] }, actorUserId });
    return NextResponse.json({ data: created.segment, draftVersion: created.version.version }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Segment could not be created" }, { status: 400 });
  }
}

export const GET = withApiGuard(GETHandler);
export const POST = withApiGuard(POSTHandler);
