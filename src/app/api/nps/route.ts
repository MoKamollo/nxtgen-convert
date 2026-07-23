import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { npsResponses, contacts } from "@/db/schema";
import { eq, and, gte } from "drizzle-orm";

export async function GET(request: NextRequest) {
  const orgId = request.headers.get("x-tenant-id");
  if (!orgId) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const windowStart = new Date();
  windowStart.setDate(windowStart.getDate() - 90);

  const rows = await db
    .select({
      id: npsResponses.id,
      score: npsResponses.score,
      feedback: npsResponses.feedback,
      submittedAt: npsResponses.submittedAt,
      createdAt: npsResponses.createdAt,
      contactId: npsResponses.contactId,
      contactFirstName: contacts.firstName,
      contactLastName: contacts.lastName,
      contactEmail: contacts.email,
    })
    .from(npsResponses)
    .leftJoin(contacts, and(eq(npsResponses.contactId, contacts.id), eq(contacts.organizationId, orgId)))
    .where(and(eq(npsResponses.organizationId, orgId), gte(npsResponses.createdAt, windowStart)));

  const submitted = rows.filter(r => r.score !== null && r.submittedAt !== null);
  const promoters  = submitted.filter(r => (r.score ?? 0) >= 9).length;
  const detractors = submitted.filter(r => (r.score ?? 0) <= 6).length;
  const npsScore   = submitted.length > 0
    ? Math.round(((promoters - detractors) / submitted.length) * 100)
    : null;

  return NextResponse.json({
    data: {
      responses: submitted,
      pending: rows.filter(r => r.score === null).length,
      total: submitted.length,
      promoters,
      detractors,
      passives: submitted.filter(r => (r.score ?? 0) >= 7 && (r.score ?? 0) <= 8).length,
      npsScore,
    },
  });
}
