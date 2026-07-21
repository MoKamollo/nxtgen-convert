import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { tickets, contacts, users } from "@/db/schema";
import { eq } from "drizzle-orm";

export async function GET(request: NextRequest) {
  try {
    const orgId = request.headers.get("x-tenant-id");
    const results = orgId
      ? await db.select().from(tickets).where(eq(tickets.organizationId, orgId))
      : await db.select().from(tickets).limit(50);
    return NextResponse.json({ data: results, total: results.length });
  } catch {
    return NextResponse.json({ error: "Failed to fetch tickets" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const ticketCount = await db.select().from(tickets).where(eq(tickets.organizationId, body.organizationId));
    const ticketNumber = `TKT-${1000 + ticketCount.length + 1}`;
    const [ticket] = await db.insert(tickets).values({
      organizationId: body.organizationId,
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
