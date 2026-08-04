import { withApiGuard } from "@/lib/api-guard";
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { products } from "@/db/schema";
import { eq } from "drizzle-orm";

async function GETHandler(request: NextRequest) {
  const orgId = request.headers.get("x-tenant-id");
  if (!orgId) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  try {
    const results = await db.select().from(products).where(eq(products.organizationId, orgId));
    return NextResponse.json({ data: results, total: results.length });
  } catch {
    return NextResponse.json({ error: "Failed to fetch products" }, { status: 500 });
  }
}

async function POSTHandler(request: NextRequest) {
  const orgId = request.headers.get("x-tenant-id");
  if (!orgId) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  try {
    const body = await request.json();
    const [product] = await db.insert(products).values({
      organizationId: orgId,
      name: body.name,
      description: body.description,
      sku: body.sku,
      type: body.type || "digital",
      price: body.price,
      currency: body.currency || "USD",
      recurring: body.recurring ?? false,
      interval: body.interval,
      trialDays: body.trialDays,
      unlimited: body.unlimited ?? true,
      isActive: true,
    }).returning();
    return NextResponse.json({ data: product }, { status: 201 });
  } catch {
    return NextResponse.json({ error: "Failed to create product" }, { status: 500 });
  }
}

export const GET = withApiGuard(GETHandler);
export const POST = withApiGuard(POSTHandler);
