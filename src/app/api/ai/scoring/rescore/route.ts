import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { contacts, organizations } from "@/db/schema";
import { and, eq } from "drizzle-orm";
import { normalizeScoringModel, scoreContact } from "@/lib/scoring";

export async function POST(request: NextRequest) {
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
    const model = normalizeScoringModel(settings.scoringModel);
    const rows = await db.select().from(contacts).where(eq(contacts.organizationId, orgId));

    const batchSize = 100;
    for (let index = 0; index < rows.length; index += batchSize) {
      const batch = rows.slice(index, index + batchSize);
      await Promise.all(
        batch.map((contact) =>
          db
            .update(contacts)
            .set({ score: scoreContact(contact, model).score, updatedAt: new Date() })
            .where(and(eq(contacts.id, contact.id), eq(contacts.organizationId, orgId))),
        ),
      );
    }
    return NextResponse.json({ ok: true, updated: rows.length });
  } catch (error) {
    console.error("[scoring:rescore]", error);
    return NextResponse.json({ error: "Failed to re-score contacts" }, { status: 500 });
  }
}
