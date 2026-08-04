import { asc, eq } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { personalizationExperiences } from "@/db/schema";
import { withApiGuard } from "@/lib/api-guard";
import { createPersonalizationDraft } from "@/lib/personalization";

async function GETHandler(request: NextRequest) {
  const organizationId = request.headers.get("x-tenant-id")!;
  const data = await db.select().from(personalizationExperiences).where(eq(personalizationExperiences.organizationId, organizationId)).orderBy(asc(personalizationExperiences.name));
  return NextResponse.json({ data });
}
async function POSTHandler(request: NextRequest) {
  const organizationId = request.headers.get("x-tenant-id")!; const actorUserId = request.headers.get("x-user-id")!; const body = await request.json();
  const key = String(body.key ?? "").trim(); const name = String(body.name ?? "").trim().slice(0, 150);
  if (!key || !name) return NextResponse.json({ error: "Experience key and name are required" }, { status: 400 });
  try {
    const created = await createPersonalizationDraft({ organizationId, key, name, description: body.description ? String(body.description).slice(0, 2_000) : null, channel: String(body.channel ?? "offer"), segmentId: body.segmentId ? String(body.segmentId) : null, definition: body.definition, startsAt: body.startsAt ? new Date(body.startsAt) : null, endsAt: body.endsAt ? new Date(body.endsAt) : null, actorUserId });
    return NextResponse.json({ data: created.experience, draftVersion: created.version.version }, { status: 201 });
  } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "Experience could not be created" }, { status: 400 }); }
}
export const GET = withApiGuard(GETHandler);
export const POST = withApiGuard(POSTHandler);
