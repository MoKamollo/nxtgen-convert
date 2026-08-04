import { withApiGuard } from "@/lib/api-guard";
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { activities, notifications } from "@/db/schema";
import { and, eq } from "drizzle-orm";

function metadataRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

async function POSTHandler(request: NextRequest) {
  const orgId = request.headers.get("x-tenant-id");
  const userId = request.headers.get("x-user-id");
  if (!orgId || !userId) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  try {
    const body = await request.json();
    const type = body.type === "email" || body.type === "notification" ? body.type : "all";
    const id = typeof body.id === "string" ? body.id : null;
    const markAll = body.all === true;
    if (!markAll && !id) return NextResponse.json({ error: "An inbox item is required" }, { status: 400 });

    let updated = 0;
    if (type === "all" || type === "notification") {
      const conditions = [
        eq(notifications.organizationId, orgId),
        eq(notifications.userId, userId),
      ];
      if (!markAll && id) conditions.push(eq(notifications.id, id));
      const rows = await db.update(notifications).set({ read: true }).where(and(...conditions)).returning({ id: notifications.id });
      updated += rows.length;
    }

    if (type === "all" || type === "email") {
      const conditions = [eq(activities.organizationId, orgId), eq(activities.type, "email")];
      if (!markAll && id) conditions.push(eq(activities.id, id));
      const rows = await db.select({ id: activities.id, metadata: activities.metadata }).from(activities).where(and(...conditions)).limit(markAll ? 500 : 1);
      await Promise.all(rows.map((row) => {
        const metadata = metadataRecord(row.metadata);
        const readBy = Array.isArray(metadata.readBy) ? metadata.readBy.filter((value): value is string => typeof value === "string") : [];
        if (!readBy.includes(userId)) readBy.push(userId);
        return db.update(activities)
          .set({ metadata: { ...metadata, readBy } })
          .where(and(eq(activities.id, row.id), eq(activities.organizationId, orgId)));
      }));
      updated += rows.length;
    }

    return NextResponse.json({ ok: true, updated });
  } catch (error) {
    console.error("POST /api/inbox/read failed", error);
    return NextResponse.json({ error: "Failed to update inbox" }, { status: 500 });
  }
}

export const POST = withApiGuard(POSTHandler);
