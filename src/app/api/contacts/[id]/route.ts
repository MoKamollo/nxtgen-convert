import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { contacts } from "@/db/schema";
import { eq, and } from "drizzle-orm";

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const orgId = request.headers.get("x-tenant-id");
  if (!orgId) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const { id } = await params;
  const body = await request.json();

  const allowed = ["firstName","lastName","email","phone","status","jobTitle","source","score","tags","companyId","ownerId","lastContactedAt"] as const;
  const updates: Record<string, unknown> = {};
  for (const key of allowed) {
    if (body[key] !== undefined) updates[key] = body[key];
  }
  updates.updatedAt = new Date();

  await db.update(contacts).set(updates).where(and(eq(contacts.id, id), eq(contacts.organizationId, orgId)));
  return NextResponse.json({ ok: true });
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const orgId = request.headers.get("x-tenant-id");
  if (!orgId) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const { id } = await params;
  await db.delete(contacts).where(and(eq(contacts.id, id), eq(contacts.organizationId, orgId)));
  return NextResponse.json({ ok: true });
}
