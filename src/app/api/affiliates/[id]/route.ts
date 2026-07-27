import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { affiliates } from "@/db/schema";
import { and, eq } from "drizzle-orm";

const STATUSES = new Set(["active", "inactive", "pending"]);

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const orgId = request.headers.get("x-tenant-id");
  if (!orgId) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  try {
    const { id } = await params;
    const body = await request.json();
    const [existing] = await db
      .select()
      .from(affiliates)
      .where(and(eq(affiliates.id, id), eq(affiliates.organizationId, orgId)))
      .limit(1);
    if (!existing) return NextResponse.json({ error: "Affiliate not found" }, { status: 404 });

    const updates: {
      status?: string;
      commissionRate?: string;
      totalClicks?: number;
      totalConversions?: number;
      totalRevenue?: string;
      totalEarnings?: string;
      paidEarnings?: string;
      updatedAt: Date;
    } = { updatedAt: new Date() };

    if (body.status !== undefined) {
      const status = String(body.status);
      if (!STATUSES.has(status)) {
        return NextResponse.json({ error: "Invalid affiliate status" }, { status: 400 });
      }
      updates.status = status;
    }
    if (body.commissionRate !== undefined) {
      const rate = Number(body.commissionRate);
      if (!Number.isFinite(rate) || rate < 0 || rate > 100) {
        return NextResponse.json(
          { error: "Commission rate must be between 0 and 100" },
          { status: 400 },
        );
      }
      updates.commissionRate = rate.toFixed(2);
    }
    for (const field of ["totalClicks", "totalConversions"] as const) {
      if (body[field] !== undefined) {
        const value = Number(body[field]);
        if (!Number.isInteger(value) || value < 0) {
          return NextResponse.json({ error: `${field} must be a positive whole number` }, { status: 400 });
        }
        updates[field] = value;
      }
    }
    for (const field of ["totalRevenue", "totalEarnings"] as const) {
      if (body[field] !== undefined) {
        const value = Number(body[field]);
        if (!Number.isFinite(value) || value < 0) {
          return NextResponse.json({ error: `${field} must be a positive amount` }, { status: 400 });
        }
        updates[field] = value.toFixed(2);
      }
    }
    if (body.markPaid === true) updates.paidEarnings = existing.totalEarnings ?? "0";

    const [updated] = await db
      .update(affiliates)
      .set(updates)
      .where(and(eq(affiliates.id, id), eq(affiliates.organizationId, orgId)))
      .returning();
    return NextResponse.json({ data: updated });
  } catch (error) {
    console.error("[affiliates:patch]", error);
    return NextResponse.json({ error: "Failed to update affiliate" }, { status: 500 });
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const orgId = request.headers.get("x-tenant-id");
  if (!orgId) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  try {
    const { id } = await params;
    const deleted = await db
      .delete(affiliates)
      .where(and(eq(affiliates.id, id), eq(affiliates.organizationId, orgId)))
      .returning({ id: affiliates.id });
    if (deleted.length === 0) {
      return NextResponse.json({ error: "Affiliate not found" }, { status: 404 });
    }
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("[affiliates:delete]", error);
    return NextResponse.json({ error: "Failed to delete affiliate" }, { status: 500 });
  }
}
