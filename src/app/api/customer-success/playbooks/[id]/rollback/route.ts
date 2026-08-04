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
    eq(customerSuccessPlaybookVersions.organizationId, organizationId), eq(customerSuccessPlaybookVersions.playbookId, id), eq(customerSuccessPlaybookVersions.id, versionId), eq(customerSuccessPlaybookVersions.status, "published"),
  )).limit(1);
  if (!version) return NextResponse.json({ error: "Published playbook version not found" }, { status: 404 });
  const [playbook] = await db.update(customerSuccessPlaybooks).set({ activeVersionId: versionId, status: "active", updatedAt: new Date() }).where(and(eq(customerSuccessPlaybooks.organizationId, organizationId), eq(customerSuccessPlaybooks.id, id))).returning();
  if (!playbook) return NextResponse.json({ error: "Playbook not found" }, { status: 404 });
  return NextResponse.json({ data: { playbook, version } });
}

export const POST = withApiGuard(POSTHandler);
