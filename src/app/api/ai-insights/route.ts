import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { contacts, deals, tasks } from "@/db/schema";
import { eq, and, desc } from "drizzle-orm";

export async function GET(request: NextRequest) {
  const orgId = request.headers.get("x-tenant-id");
  if (!orgId) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  try {
    const [contactRows, dealRows, taskRows] = await Promise.all([
      db.select({
        id: contacts.id, firstName: contacts.firstName, lastName: contacts.lastName,
        status: contacts.status, score: contacts.score,
        lastContactedAt: contacts.lastContactedAt, updatedAt: contacts.updatedAt,
      }).from(contacts).where(eq(contacts.organizationId, orgId))
        .orderBy(desc(contacts.score)).limit(500),
      db.select({
        id: deals.id, name: deals.name, stage: deals.stage,
        contactId: deals.contactId, value: deals.value, updatedAt: deals.updatedAt,
      }).from(deals).where(eq(deals.organizationId, orgId))
        .orderBy(desc(deals.updatedAt)).limit(200),
      db.select({
        title: tasks.title, status: tasks.status, dueDate: tasks.dueDate,
      }).from(tasks).where(eq(tasks.organizationId, orgId))
        .orderBy(tasks.dueDate).limit(200),
    ]);

    const insights: {
      id: string; type: string; title: string; body: string;
      priority: string; contact?: string; impact?: string; action: string;
    }[] = [];

    // Churn risk: contacts with status=churned in the last 30 days
    const cutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const recentChurns = contactRows.filter(c =>
      c.status === "churned" && c.updatedAt && new Date(c.updatedAt) > cutoff
    );
    if (recentChurns.length > 0) {
      const first = recentChurns[0];
      insights.push({
        id: "churn-recent",
        type: "churn",
        title: `${recentChurns.length} customer${recentChurns.length > 1 ? "s" : ""} churned this month`,
        body: `${first.firstName} ${first.lastName ?? ""}${recentChurns.length > 1 ? ` and ${recentChurns.length - 1} others` : ""} recently churned. Consider a win-back campaign.`,
        priority: recentChurns.length >= 3 ? "high" : "medium",
        contact: `${first.firstName} ${first.lastName ?? ""}`.trim(),
        action: "Review churned contacts",
      });
    }

    // Opportunity: high-score leads not yet contacted
    const hotLeads = contactRows.filter(c =>
      c.status === "lead" && (c.score ?? 0) >= 70 && !c.lastContactedAt
    );
    if (hotLeads.length > 0) {
      insights.push({
        id: "hot-leads",
        type: "opportunity",
        title: `${hotLeads.length} hot lead${hotLeads.length > 1 ? "s" : ""} awaiting first contact`,
        body: `${hotLeads.map(l => `${l.firstName} ${l.lastName ?? ""}`.trim()).slice(0, 3).join(", ")}${hotLeads.length > 3 ? ` and ${hotLeads.length - 3} more` : ""} have high scores but haven't been contacted yet.`,
        priority: "high",
        impact: `Potential: ${hotLeads.length} new opportunities`,
        action: "Reach out now",
      });
    }

    // Expansion: VIP contacts without open deals
    const vipContacts = contactRows.filter(c => c.status === "vip");
    const contactsWithActiveDeals = new Set(
      dealRows.filter(d => !["closed_won","closed_lost"].includes(d.stage ?? "")).map(d => d.contactId)
    );
    const vipWithoutDeals = vipContacts.filter(c => !contactsWithActiveDeals.has(c.id));
    if (vipWithoutDeals.length > 0) {
      insights.push({
        id: "vip-expansion",
        type: "expansion",
        title: `${vipWithoutDeals.length} VIP contact${vipWithoutDeals.length > 1 ? "s" : ""} with no active deal`,
        body: `${vipWithoutDeals.slice(0, 2).map(c => `${c.firstName} ${c.lastName ?? ""}`.trim()).join(", ")} are VIP contacts without an open deal. Upsell opportunity.`,
        priority: "medium",
        impact: "Upsell or cross-sell opportunity",
        action: "Create expansion deal",
      });
    }

    // Deals stuck in negotiation > 30 days
    const stuckDeals = dealRows.filter(d =>
      d.stage === "negotiation" && d.updatedAt && new Date(d.updatedAt) < cutoff
    );
    if (stuckDeals.length > 0) {
      insights.push({
        id: "stuck-deals",
        type: "campaign",
        title: `${stuckDeals.length} deal${stuckDeals.length > 1 ? "s" : ""} stuck in negotiation`,
        body: `${stuckDeals.map(d => d.name).slice(0, 2).join(", ")}${stuckDeals.length > 2 ? ` and ${stuckDeals.length - 2} more` : ""} have been in negotiation for over 30 days without updates.`,
        priority: "high",
        action: "Follow up on deals",
      });
    }

    // Overdue tasks
    const now = new Date();
    const overdueTasks = taskRows.filter(t =>
      t.status !== "completed" && t.dueDate && new Date(t.dueDate) < now
    );
    if (overdueTasks.length > 0) {
      insights.push({
        id: "overdue-tasks",
        type: "campaign",
        title: `${overdueTasks.length} overdue task${overdueTasks.length > 1 ? "s" : ""}`,
        body: `You have ${overdueTasks.length} past-due task${overdueTasks.length > 1 ? "s" : ""}: "${overdueTasks[0].title}"${overdueTasks.length > 1 ? ` and ${overdueTasks.length - 1} more` : ""}. These may be blocking deals.`,
        priority: overdueTasks.length >= 3 ? "high" : "medium",
        action: "Review overdue tasks",
      });
    }

    return NextResponse.json({ data: insights });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "Failed to generate insights" }, { status: 500 });
  }
}
