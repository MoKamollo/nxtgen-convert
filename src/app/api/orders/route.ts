import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { contacts, orders, products } from "@/db/schema";
import { and, desc, eq, ilike, inArray, or, sql } from "drizzle-orm";

type OrderItemInput = {
  productId?: unknown;
  name?: unknown;
  quantity?: unknown;
  price?: unknown;
};

const ORDER_STATUSES = new Set(["pending", "completed", "refunded", "cancelled"]);
const PAYMENT_STATUSES = new Set(["pending", "paid", "failed", "refunded"]);
const PAYMENT_METHODS = new Set(["cash", "card", "bank_transfer", "stripe"]);

export async function GET(request: NextRequest) {
  const orgId = request.headers.get("x-tenant-id");
  if (!orgId) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  try {
    const params = request.nextUrl.searchParams;
    const page = Math.max(1, Number(params.get("page") ?? 1));
    const limit = Math.min(100, Math.max(1, Number(params.get("limit") ?? 25)));
    const status = params.get("status");
    const query = params.get("q")?.trim();
    const filters = [eq(orders.organizationId, orgId)];
    if (status && status !== "all" && ORDER_STATUSES.has(status)) {
      filters.push(eq(orders.status, status));
    }
    if (query) {
      filters.push(
        or(
          ilike(orders.orderNumber, `%${query}%`),
          ilike(contacts.firstName, `%${query}%`),
          ilike(contacts.lastName, `%${query}%`),
          ilike(contacts.email, `%${query}%`),
        )!,
      );
    }

    const baseJoin = db
      .select({
        id: orders.id,
        orderNumber: orders.orderNumber,
        contactId: orders.contactId,
        contactFirstName: contacts.firstName,
        contactLastName: contacts.lastName,
        contactEmail: contacts.email,
        status: orders.status,
        subtotal: orders.subtotal,
        tax: orders.tax,
        discount: orders.discount,
        total: orders.total,
        currency: orders.currency,
        items: orders.items,
        paymentMethod: orders.paymentMethod,
        paymentStatus: orders.paymentStatus,
        notes: orders.notes,
        createdAt: orders.createdAt,
        updatedAt: orders.updatedAt,
      })
      .from(orders)
      .leftJoin(
        contacts,
        and(eq(orders.contactId, contacts.id), eq(contacts.organizationId, orgId)),
      );

    const data = await baseJoin
      .where(and(...filters))
      .orderBy(desc(orders.createdAt))
      .limit(limit)
      .offset((page - 1) * limit);

    const [{ count }] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(orders)
      .leftJoin(
        contacts,
        and(eq(orders.contactId, contacts.id), eq(contacts.organizationId, orgId)),
      )
      .where(and(...filters));

    return NextResponse.json({
      data,
      total: count,
      page,
      limit,
      hasMore: page * limit < count,
    });
  } catch (error) {
    console.error("[orders:get]", error);
    return NextResponse.json({ error: "Failed to fetch orders" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const orgId = request.headers.get("x-tenant-id");
  if (!orgId) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  try {
    const body = await request.json();
    const contactId = String(body.contactId ?? "").trim();
    if (!contactId) {
      return NextResponse.json({ error: "Select a contact" }, { status: 400 });
    }
    const [contact] = await db
      .select({ id: contacts.id })
      .from(contacts)
      .where(and(eq(contacts.id, contactId), eq(contacts.organizationId, orgId)))
      .limit(1);
    if (!contact) {
      return NextResponse.json({ error: "Contact not found" }, { status: 400 });
    }

    if (!Array.isArray(body.items) || body.items.length === 0 || body.items.length > 100) {
      return NextResponse.json(
        { error: "Add between 1 and 100 line items" },
        { status: 400 },
      );
    }

    const items = (body.items as OrderItemInput[]).map((item) => ({
      productId: item.productId ? String(item.productId) : undefined,
      name: String(item.name ?? "").trim(),
      quantity: Number(item.quantity),
      price: Number(item.price),
    }));
    if (
      items.some(
        (item) =>
          !item.name ||
          !Number.isInteger(item.quantity) ||
          item.quantity < 1 ||
          item.quantity > 100_000 ||
          !Number.isFinite(item.price) ||
          item.price < 0,
      )
    ) {
      return NextResponse.json(
        { error: "Each line item needs a name, a positive whole quantity, and a valid price" },
        { status: 400 },
      );
    }

    const productIds = [...new Set(items.flatMap((item) => (item.productId ? [item.productId] : [])))];
    if (productIds.length > 0) {
      const ownedProducts = await db
        .select({ id: products.id })
        .from(products)
        .where(and(eq(products.organizationId, orgId), inArray(products.id, productIds)));
      if (ownedProducts.length !== productIds.length) {
        return NextResponse.json(
          { error: "One or more selected products are unavailable" },
          { status: 400 },
        );
      }
    }

    const subtotal = items.reduce((sum, item) => sum + item.quantity * item.price, 0);
    const tax = Number(body.tax ?? 0);
    const discount = Number(body.discount ?? 0);
    if (!Number.isFinite(tax) || tax < 0 || !Number.isFinite(discount) || discount < 0) {
      return NextResponse.json({ error: "Tax and discount must be valid positive amounts" }, { status: 400 });
    }

    const status = String(body.status ?? "pending");
    const paymentStatus = String(body.paymentStatus ?? "pending");
    const paymentMethod = body.paymentMethod ? String(body.paymentMethod) : null;
    if (!ORDER_STATUSES.has(status)) {
      return NextResponse.json({ error: "Invalid order status" }, { status: 400 });
    }
    if (!PAYMENT_STATUSES.has(paymentStatus)) {
      return NextResponse.json({ error: "Invalid payment status" }, { status: 400 });
    }
    if (paymentMethod && !PAYMENT_METHODS.has(paymentMethod)) {
      return NextResponse.json({ error: "Invalid payment method" }, { status: 400 });
    }

    const currency = String(body.currency ?? "USD").trim().toUpperCase();
    if (!/^[A-Z]{3}$/.test(currency)) {
      return NextResponse.json({ error: "Currency must be a three-letter code" }, { status: 400 });
    }

    const total = Math.max(0, subtotal + tax - discount);
    const orderNumber = `NX-${Date.now().toString(36).toUpperCase()}-${Math.random()
      .toString(36)
      .slice(2, 6)
      .toUpperCase()}`;
    const [created] = await db
      .insert(orders)
      .values({
        organizationId: orgId,
        orderNumber,
        contactId,
        status,
        subtotal: subtotal.toFixed(2),
        tax: tax.toFixed(2),
        discount: discount.toFixed(2),
        total: total.toFixed(2),
        currency,
        items,
        paymentMethod,
        paymentStatus,
        notes: body.notes ? String(body.notes).trim().slice(0, 10_000) : null,
      })
      .returning();
    return NextResponse.json({ data: created }, { status: 201 });
  } catch (error) {
    console.error("[orders:post]", error);
    return NextResponse.json({ error: "Failed to create order" }, { status: 500 });
  }
}
