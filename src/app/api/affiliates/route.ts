import { withApiGuard } from "@/lib/api-guard";
import { randomBytes } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { affiliates, contacts } from "@/db/schema";
import { and, desc, eq } from "drizzle-orm";

const STATUSES = new Set(["active", "inactive", "pending"]);

function generateCode() {
  return randomBytes(6).toString("base64url").replace(/[^A-Za-z0-9]/g, "").slice(0, 8).toUpperCase();
}

async function GETHandler(request: NextRequest) {
  const orgId = request.headers.get("x-tenant-id");
  if (!orgId) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  try {
    const status = request.nextUrl.searchParams.get("status");
    const filters = [eq(affiliates.organizationId, orgId)];
    if (status && status !== "all" && STATUSES.has(status)) {
      filters.push(eq(affiliates.status, status));
    }
    const data = await db
      .select({
        id: affiliates.id,
        contactId: affiliates.contactId,
        contactFirstName: contacts.firstName,
        contactLastName: contacts.lastName,
        contactEmail: contacts.email,
        code: affiliates.code,
        status: affiliates.status,
        commissionRate: affiliates.commissionRate,
        totalClicks: affiliates.totalClicks,
        totalConversions: affiliates.totalConversions,
        totalRevenue: affiliates.totalRevenue,
        totalEarnings: affiliates.totalEarnings,
        paidEarnings: affiliates.paidEarnings,
        createdAt: affiliates.createdAt,
      })
      .from(affiliates)
      .leftJoin(
        contacts,
        and(eq(affiliates.contactId, contacts.id), eq(contacts.organizationId, orgId)),
      )
      .where(and(...filters))
      .orderBy(desc(affiliates.createdAt));
    return NextResponse.json({ data, total: data.length });
  } catch (error) {
    console.error("[affiliates:get]", error);
    return NextResponse.json({ error: "Failed to fetch affiliates" }, { status: 500 });
  }
}

async function POSTHandler(request: NextRequest) {
  const orgId = request.headers.get("x-tenant-id");
  if (!orgId) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  try {
    const body = await request.json();
    const contactId = String(body.contactId ?? "").trim();
    if (!contactId) return NextResponse.json({ error: "Select a contact" }, { status: 400 });
    const [contact] = await db
      .select({ id: contacts.id })
      .from(contacts)
      .where(and(eq(contacts.id, contactId), eq(contacts.organizationId, orgId)))
      .limit(1);
    if (!contact) return NextResponse.json({ error: "Contact not found" }, { status: 400 });

    const code = String(body.code || generateCode())
      .trim()
      .toUpperCase()
      .replace(/[^A-Z0-9_-]/g, "")
      .slice(0, 32);
    if (code.length < 4) {
      return NextResponse.json(
        { error: "Affiliate code must be at least 4 characters" },
        { status: 400 },
      );
    }
    const duplicate = await db
      .select({ id: affiliates.id })
      .from(affiliates)
      .where(and(eq(affiliates.organizationId, orgId), eq(affiliates.code, code)))
      .limit(1);
    if (duplicate.length > 0) {
      return NextResponse.json({ error: "Affiliate code already exists" }, { status: 409 });
    }

    const rate = Number(body.commissionRate ?? 10);
    const status = String(body.status ?? "active");
    if (!Number.isFinite(rate) || rate < 0 || rate > 100) {
      return NextResponse.json(
        { error: "Commission rate must be between 0 and 100" },
        { status: 400 },
      );
    }
    if (!STATUSES.has(status)) {
      return NextResponse.json({ error: "Invalid affiliate status" }, { status: 400 });
    }

    const [created] = await db
      .insert(affiliates)
      .values({
        organizationId: orgId,
        contactId,
        code,
        status,
        commissionRate: rate.toFixed(2),
      })
      .returning();
    return NextResponse.json({ data: created }, { status: 201 });
  } catch (error) {
    console.error("[affiliates:post]", error);
    const message = error instanceof Error ? error.message : "";
    if (message.toLowerCase().includes("unique")) {
      return NextResponse.json({ error: "Affiliate code already exists" }, { status: 409 });
    }
    return NextResponse.json({ error: "Failed to create affiliate" }, { status: 500 });
  }
}

export const GET = withApiGuard(GETHandler);
export const POST = withApiGuard(POSTHandler);
