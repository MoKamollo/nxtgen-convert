import { withApiGuard } from "@/lib/api-guard";
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { tickets, contacts } from "@/db/schema";
import { eq } from "drizzle-orm";

async function GETHandler(request: NextRequest) {
  const orgId = request.headers.get("x-tenant-id");
  if (!orgId) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  try {
    const [ticketRows, contactRows] = await Promise.all([
      db.select().from(tickets).where(eq(tickets.organizationId, orgId)),
      db.select({ id: contacts.id, firstName: contacts.firstName, lastName: contacts.lastName }).from(contacts).where(eq(contacts.organizationId, orgId)),
    ]);
    const contactMap = new Map(contactRows.map(c => [c.id, `${c.firstName} ${c.lastName ?? ""}`.trim()]));
    const results = ticketRows.map(t => ({
      ...t,
      contactName: t.contactId ? (contactMap.get(t.contactId) ?? null) : null,
    }));
    return NextResponse.json({ data: results, total: results.length });
  } catch {
    return NextResponse.json({ error: "Failed to fetch tickets" }, { status: 500 });
  }
}

async function POSTHandler(request: NextRequest) {
  const orgId = request.headers.get("x-tenant-id");
  if (!orgId) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  try {
    const body = await request.json();
    const existingTickets = await db.select({ id: tickets.id }).from(tickets).where(eq(tickets.organizationId, orgId));
    const ticketNumber = `TKT-${1000 + existingTickets.length + 1}`;
    const [ticket] = await db.insert(tickets).values({
      organizationId: orgId,
      ticketNumber,
      subject: body.subject,
      description: body.description,
      status: "open",
      priority: body.priority || "medium",
      contactId: body.contactId,
      assigneeId: body.assigneeId,
      source: body.source || "Portal",
      tags: body.tags || [],
    }).returning();
    return NextResponse.json({ data: ticket }, { status: 201 });
  } catch {
    return NextResponse.json({ error: "Failed to create ticket" }, { status: 500 });
  }
}

export const GET = withApiGuard(GETHandler);
export const POST = withApiGuard(POSTHandler);
