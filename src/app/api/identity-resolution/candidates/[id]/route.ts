import { and, eq } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { identityResolutionCandidates } from "@/db/schema";
import { withApiGuard } from "@/lib/api-guard";

const STATUSES = new Set(["confirmed_match", "rejected", "resolved"]);

async function PATCHHandler(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const organizationId = request.headers.get("x-tenant-id")!;
  const actorUserId = request.headers.get("x-user-id");
  const { id } = await params;
  const body = await request.json();
  const status = String(body.status ?? "");
  if (!STATUSES.has(status)) return NextResponse.json({ error: "Invalid review status" }, { status: 400 });
  const [record] = await db.update(identityResolutionCandidates).set({
    status,
    reviewedByUserId: actorUserId,
    reviewedAt: new Date(),
    updatedAt: new Date(),
    evidence: body.notes ? { reviewNotes: String(body.notes).slice(0, 1000) } : undefined,
  }).where(and(eq(identityResolutionCandidates.organizationId, organizationId), eq(identityResolutionCandidates.id, id))).returning();
  if (!record) return NextResponse.json({ error: "Candidate not found" }, { status: 404 });
  return NextResponse.json({ data: record, merged: false });
}

export const PATCH = withApiGuard(PATCHHandler);
