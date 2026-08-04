import { withApiGuard } from "@/lib/api-guard";
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { contacts, products, subscriptions } from "@/db/schema";
import { and, desc, eq } from "drizzle-orm";

const STATUSES = new Set(["active", "paused", "cancelled", "past_due"]);
const INTERVALS = new Set(["week", "month", "year"]);

async function GETHandler(request: NextRequest) {
  const orgId = request.headers.get("x-tenant-id");
  if (!orgId) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  try {
    const status = request.nextUrl.searchParams.get("status");
    const filters = [eq(subscriptions.organizationId, orgId)];
    if (status && status !== "all" && STATUSES.has(status)) {
      filters.push(eq(subscriptions.status, status));
    }
    const data = await db
      .select({
        id: subscriptions.id,
        contactId: subscriptions.contactId,
        contactFirstName: contacts.firstName,
        contactLastName: contacts.lastName,
        contactEmail: contacts.email,
        productId: subscriptions.productId,
        productName: products.name,
        status: subscriptions.status,
        currentPeriodStart: subscriptions.currentPeriodStart,
        currentPeriodEnd: subscriptions.currentPeriodEnd,
        amount: subscriptions.amount,
        currency: subscriptions.currency,
        interval: subscriptions.interval,
        cancelledAt: subscriptions.cancelledAt,
        createdAt: subscriptions.createdAt,
      })
      .from(subscriptions)
      .leftJoin(
        contacts,
        and(eq(subscriptions.contactId, contacts.id), eq(contacts.organizationId, orgId)),
      )
      .leftJoin(
        products,
        and(eq(subscriptions.productId, products.id), eq(products.organizationId, orgId)),
      )
      .where(and(...filters))
      .orderBy(desc(subscriptions.createdAt));
    return NextResponse.json({ data, total: data.length });
  } catch (error) {
    console.error("[subscriptions:get]", error);
    return NextResponse.json({ error: "Failed to fetch subscriptions" }, { status: 500 });
  }
}

async function POSTHandler(request: NextRequest) {
  const orgId = request.headers.get("x-tenant-id");
  if (!orgId) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  try {
    const body = await request.json();
    const contactId = String(body.contactId ?? "").trim();
    const productId = String(body.productId ?? "").trim();
    const amount = Number(body.amount);
    const currentPeriodStart = body.currentPeriodStart
      ? new Date(String(body.currentPeriodStart))
      : new Date();
    const currentPeriodEnd = body.currentPeriodEnd
      ? new Date(String(body.currentPeriodEnd))
      : new Date(Date.now() + 30 * 86_400_000);
    const status = String(body.status ?? "active");
    const interval = String(body.interval ?? "month");
    const currency = String(body.currency ?? "USD").trim().toUpperCase();

    if (!contactId || !productId || !Number.isFinite(amount) || amount < 0) {
      return NextResponse.json(
        { error: "Contact, product, and a valid amount are required" },
        { status: 400 },
      );
    }
    if (
      Number.isNaN(currentPeriodStart.getTime()) ||
      Number.isNaN(currentPeriodEnd.getTime()) ||
      currentPeriodEnd <= currentPeriodStart
    ) {
      return NextResponse.json({ error: "Subscription period is invalid" }, { status: 400 });
    }
    if (!STATUSES.has(status) || !INTERVALS.has(interval) || !/^[A-Z]{3}$/.test(currency)) {
      return NextResponse.json({ error: "Subscription configuration is invalid" }, { status: 400 });
    }

    const [[contact], [product]] = await Promise.all([
      db
        .select({ id: contacts.id })
        .from(contacts)
        .where(and(eq(contacts.id, contactId), eq(contacts.organizationId, orgId)))
        .limit(1),
      db
        .select({ id: products.id })
        .from(products)
        .where(and(eq(products.id, productId), eq(products.organizationId, orgId)))
        .limit(1),
    ]);
    if (!contact || !product) {
      return NextResponse.json(
        { error: "Selected contact or product is unavailable" },
        { status: 400 },
      );
    }

    const [created] = await db
      .insert(subscriptions)
      .values({
        organizationId: orgId,
        contactId,
        productId,
        status,
        currentPeriodStart,
        currentPeriodEnd,
        amount: amount.toFixed(2),
        currency,
        interval,
        cancelledAt: status === "cancelled" ? new Date() : null,
      })
      .returning();
    return NextResponse.json({ data: created }, { status: 201 });
  } catch (error) {
    console.error("[subscriptions:post]", error);
    return NextResponse.json({ error: "Failed to create subscription" }, { status: 500 });
  }
}

export const GET = withApiGuard(GETHandler);
export const POST = withApiGuard(POSTHandler);
