import { withApiGuard } from "@/lib/api-guard";
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { organizations } from "@/db/schema";
import { eq } from "drizzle-orm";
import { normalizeScoringModel } from "@/lib/scoring";

async function GETHandler(request: NextRequest) {
  const orgId = request.headers.get("x-tenant-id");
  if (!orgId) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  try {
    const [org] = await db
      .select({ settings: organizations.settings })
      .from(organizations)
      .where(eq(organizations.id, orgId))
      .limit(1);
    if (!org) return NextResponse.json({ error: "Organization not found" }, { status: 404 });
    const settings = (org.settings ?? {}) as Record<string, unknown> & { scoringModel?: unknown };
    return NextResponse.json({ data: normalizeScoringModel(settings.scoringModel) });
  } catch (error) {
    console.error("[scoring-model:get]", error);
    return NextResponse.json({ error: "Failed to fetch scoring model" }, { status: 500 });
  }
}

async function PATCHHandler(request: NextRequest) {
  const orgId = request.headers.get("x-tenant-id");
  if (!orgId) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  try {
    const body = await request.json();
    const [org] = await db
      .select({ settings: organizations.settings })
      .from(organizations)
      .where(eq(organizations.id, orgId))
      .limit(1);
    if (!org) return NextResponse.json({ error: "Organization not found" }, { status: 404 });
    const settings = (org.settings ?? {}) as Record<string, unknown>;
    const model = normalizeScoringModel(body);
    await db
      .update(organizations)
      .set({ settings: { ...settings, scoringModel: model }, updatedAt: new Date() })
      .where(eq(organizations.id, orgId));
    return NextResponse.json({ data: model });
  } catch (error) {
    console.error("[scoring-model:patch]", error);
    return NextResponse.json({ error: "Failed to save scoring model" }, { status: 500 });
  }
}

export const GET = withApiGuard(GETHandler);
export const PATCH = withApiGuard(PATCHHandler);
