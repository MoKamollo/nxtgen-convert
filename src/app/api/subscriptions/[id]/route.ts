import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { subscriptions } from "@/db/schema";
import { and, eq } from "drizzle-orm";

const STATUSES = new Set(["active", "paused", "cancelled", "past_due"]);
const INTERVALS = new Set(["week", "month", "year"]);

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const orgId = request.headers.get("x-tenant-id");
  if (!orgId) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  try {
    const { id } = await params;
    const body = await request.json();
    const updates: {
      status?: string;
      cancelledAt?: Date | null;
      amount?: string;
      interval?: string;
      currentPeriodStart?: Date;
      currentPeriodEnd?: Date;
      updatedAt: Date;
    } = { updatedAt: new Date() };

    if (body.status !== undefined) {
      const status = String(body.status);
      if (!STATUSES.has(status)) {
        return NextResponse.json({ error: "Invalid subscription status" }, { status: 400 });
      }
      updates.status = status;
      updates.cancelledAt = status === "cancelled" ? new Date() : null;
    }
    if (body.amount !== undefined) {
      const amount = Number(body.amount);
      if (!Number.isFinite(amount) || amount < 0) {
        return NextResponse.json({ error: "Amount must be a valid positive number" }, { status: 400 });
      }
      updates.amount = amount.toFixed(2);
    }
    if (body.interval !== undefined) {
      const interval = String(body.interval);
      if (!INTERVALS.has(interval)) {
        return NextResponse.json({ error: "Invalid billing interval" }, { status: 400 });
      }
      updates.interval = interval;
    }
    if (body.currentPeriodStart !== undefined) {
      const date = new Date(String(body.currentPeriodStart));
      if (Number.isNaN(date.getTime())) {
        return NextResponse.json({ error: "Invalid period start" }, { status: 400 });
      }
      updates.currentPeriodStart = date;
    }
    if (body.currentPeriodEnd !== undefined) {
      const date = new Date(String(body.currentPeriodEnd));
      if (Number.isNaN(date.getTime())) {
        return NextResponse.json({ error: "Invalid period end" }, { status: 400 });
      }
      updates.currentPeriodEnd = date;
    }

    const [updated] = await db
      .update(subscriptions)
      .set(updates)
      .where(and(eq(subscriptions.id, id), eq(subscriptions.organizationId, orgId)))
      .returning();
    if (!updated) return NextResponse.json({ error: "Subscription not found" }, { status: 404 });
    return NextResponse.json({ data: updated });
  } catch (error) {
    console.error("[subscriptions:patch]", error);
    return NextResponse.json({ error: "Failed to update subscription" }, { status: 500 });
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
      .delete(subscriptions)
      .where(and(eq(subscriptions.id, id), eq(subscriptions.organizationId, orgId)))
      .returning({ id: subscriptions.id });
    if (deleted.length === 0) {
      return NextResponse.json({ error: "Subscription not found" }, { status: 404 });
    }
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("[subscriptions:delete]", error);
    return NextResponse.json({ error: "Failed to delete subscription" }, { status: 500 });
  }
}
