import { withApiGuard } from "@/lib/api-guard";
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { contacts, tickets, workflows, deals } from "@/db/schema";
import { eq, and, gte, notInArray } from "drizzle-orm";

async function GETHandler(request: NextRequest) {
  const orgId = request.headers.get("x-tenant-id");
  if (!orgId) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  try {
    const [contactRows, ticketRows, workflowRows, dealRows] = await Promise.all([
      db.select({ score: contacts.score, status: contacts.status })
        .from(contacts)
        .where(and(eq(contacts.organizationId, orgId), gte(contacts.score, 70))),
      db.select({ status: tickets.status })
        .from(tickets)
        .where(and(eq(tickets.organizationId, orgId), notInArray(tickets.status, ["resolved", "closed"]))),
      db.select({ status: workflows.status })
        .from(workflows)
        .where(and(eq(workflows.organizationId, orgId), eq(workflows.status, "active"))),
      db.select({ stage: deals.stage })
        .from(deals)
        .where(and(eq(deals.organizationId, orgId), eq(deals.stage, "negotiation"))),
    ]);

    const hotLeads        = contactRows.filter(c => c.status === "lead").length;
    const openTickets     = ticketRows.length;
    const activeWorkflows = workflowRows.length;
    const negotiationDeals = dealRows.length;

    return NextResponse.json({
      "/crm/contacts":          hotLeads        > 0 ? hotLeads        : undefined,
      "/support/tickets":       openTickets     > 0 ? openTickets     : undefined,
      "/automation/workflows":  activeWorkflows > 0 ? activeWorkflows : undefined,
      "/crm/deals":             negotiationDeals > 0 ? negotiationDeals : undefined,
    });
  } catch {
    return NextResponse.json({});
  }
}

export const GET = withApiGuard(GETHandler);
