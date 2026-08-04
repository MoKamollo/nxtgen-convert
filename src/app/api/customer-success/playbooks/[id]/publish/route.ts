import { and, eq } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { customerSuccessPlaybooks, customerSuccessPlaybookVersions } from "@/db/schema";
import { withApiGuard } from "@/lib/api-guard";

async function POSTHandler(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const organizationId = request.headers.get("x-tenant-id")!;
  const { id } = await params;
  const body = await request.json().catch(() => ({}));
  const versionId = String(body.versionId ?? "");
  if (!versionId) return NextResponse.json({ error: "versionId is required" }, { status: 400 });
  const [version] = await db.select().from(customerSuccessPlaybookVersions).where(and(
    eq(customerSuccessPlaybookVersions.organizationId, organizationId), eq(customerSuccessPlaybookVersions.playbookId, id), eq(customerSuccessPlaybookVersions.id, versionId),
  )).limit(1);
  if (!version) return NextResponse.json({ error: "Playbook version not found" }, { status: 404 });
  if (version.status === "published") return NextResponse.json({ error: "Version is already published" }, { status: 409 });
  const now = new Date();
  const result = await db.transaction(async (tx) => {
    const [published] = await tx.update(customerSuccessPlaybookVersions).set({ status: "published", publishedAt: now }).where(and(eq(customerSuccessPlaybookVersions.organizationId, organizationId), eq(customerSuccessPlaybookVersions.id, versionId), eq(customerSuccessPlaybookVersions.status, "draft"))).returning();
    if (!published) throw new Error("Version could not be published");
    const [playbook] = await tx.update(customerSuccessPlaybooks).set({ activeVersionId: versionId, status: "active", updatedAt: now }).where(and(eq(customerSuccessPlaybooks.organizationId, organizationId), eq(customerSuccessPlaybooks.id, id))).returning();
    if (!playbook) throw new Error("Playbook not found");
    return { playbook, version: published };
  });
  return NextResponse.json({ data: result });
}

export const POST = withApiGuard(POSTHandler);
