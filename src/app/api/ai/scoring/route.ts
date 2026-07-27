import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { contacts, organizations } from "@/db/schema";
import { eq } from "drizzle-orm";
import { normalizeScoringModel, scoreContact, type ScoringModel } from "@/lib/scoring";

export async function GET(request: NextRequest) {
  const orgId = request.headers.get("x-tenant-id");
  if (!orgId) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  try {
    const [org] = await db.select({ settings: organizations.settings }).from(organizations).where(eq(organizations.id, orgId)).limit(1);
    if (!org) return NextResponse.json({ error: "Organization not found" }, { status: 404 });
    const settings = (org.settings ?? {}) as Record<string, unknown> & { scoringModel?: ScoringModel };
    const model = normalizeScoringModel(settings.scoringModel);
    const rows = await db.select().from(contacts).where(eq(contacts.organizationId, orgId));
    const data = rows.map(contact => ({ ...contact, scoreBreakdown: scoreContact(contact, model) })).sort((a, b) => b.scoreBreakdown.score - a.scoreBreakdown.score);
    return NextResponse.json({ data, model });
  } catch {
    return NextResponse.json({ error: "Failed to fetch scoring data" }, { status: 500 });
  }
}
