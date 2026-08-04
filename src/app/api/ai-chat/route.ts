import { withApiGuard } from "@/lib/api-guard";
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { contacts, deals, tickets, workflows, campaigns } from "@/db/schema";
import { eq } from "drizzle-orm";
import Groq from "groq-sdk";
import { fetchBrainContext } from "@/lib/brain";

async function POSTHandler(request: NextRequest) {
  const orgId = request.headers.get("x-tenant-id");
  if (!orgId) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  if (!process.env.GROQ_API_KEY) {
    return NextResponse.json({ error: "AI assistant not configured — add GROQ_API_KEY to environment variables" }, { status: 503 });
  }

  const body = await request.json().catch(() => null) as { message?: unknown; history?: unknown } | null;
  const userMessage = typeof body?.message === "string" ? body.message.trim().slice(0, 4_000) : "";
  const history = Array.isArray(body?.history)
    ? body.history.slice(-20).flatMap((item) => {
        if (!item || typeof item !== "object") return [];
        const role = (item as { role?: unknown }).role;
        const content = (item as { content?: unknown }).content;
        if ((role !== "user" && role !== "assistant") || typeof content !== "string") return [];
        return [{ role, content: content.slice(0, 4_000) } as const];
      })
    : [];

  if (!userMessage) return NextResponse.json({ error: "Message required" }, { status: 400 });

  // Fetch live CRM snapshot
  const [contactRows, dealRows, ticketRows, workflowRows, campaignRows] = await Promise.all([
    db.select({ id: contacts.id, status: contacts.status, score: contacts.score, lastContactedAt: contacts.lastContactedAt }).from(contacts).where(eq(contacts.organizationId, orgId)),
    db.select({ id: deals.id, name: deals.name, value: deals.value, stage: deals.stage }).from(deals).where(eq(deals.organizationId, orgId)),
    db.select({ id: tickets.id, status: tickets.status, priority: tickets.priority }).from(tickets).where(eq(tickets.organizationId, orgId)),
    db.select({ id: workflows.id, status: workflows.status, enrolledCount: workflows.enrolledCount }).from(workflows).where(eq(workflows.organizationId, orgId)),
    db.select({ id: campaigns.id, name: campaigns.name, status: campaigns.status, stats: campaigns.stats }).from(campaigns).where(eq(campaigns.organizationId, orgId)),
  ]);

  const totalContacts   = contactRows.length;
  const leads           = contactRows.filter(c => c.status === "lead").length;
  const customers       = contactRows.filter(c => c.status === "customer" || c.status === "vip").length;
  const churned         = contactRows.filter(c => c.status === "churned").length;
  const hotLeads        = contactRows.filter(c => (c.score ?? 0) >= 70 && c.status === "lead" && !c.lastContactedAt).length;

  const activeDeals     = dealRows.filter(d => !["closed_won", "closed_lost"].includes(d.stage ?? ""));
  const pipelineValue   = activeDeals.reduce((s, d) => s + parseFloat(d.value ?? "0"), 0);
  const wonDeals        = dealRows.filter(d => d.stage === "closed_won");
  const closedDeals     = dealRows.filter(d => ["closed_won", "closed_lost"].includes(d.stage ?? ""));
  const winRate         = closedDeals.length > 0 ? Math.round((wonDeals.length / closedDeals.length) * 100) : 0;

  const openTickets     = ticketRows.filter(t => !["resolved", "closed"].includes(t.status ?? "")).length;
  const criticalTickets = ticketRows.filter(t => t.priority === "critical" && !["resolved", "closed"].includes(t.status ?? "")).length;

  const activeWorkflows = workflowRows.filter(w => w.status === "active").length;
  const totalEnrolled   = workflowRows.reduce((s, w) => s + (w.enrolledCount ?? 0), 0);

  const sentCampaigns   = campaignRows.filter(c => c.status === "sent");
  const totalSent       = sentCampaigns.reduce((s, c) => s + ((c.stats as Record<string, number>)?.sent ?? 0), 0);
  const totalDelivered  = sentCampaigns.reduce((s, c) => s + ((c.stats as Record<string, number>)?.delivered ?? 0), 0);
  const totalOpened     = sentCampaigns.reduce((s, c) => s + ((c.stats as Record<string, number>)?.opened ?? 0), 0);
  const avgOpenRate     = totalDelivered > 0 ? Math.round((totalOpened / totalDelivered) * 100) : 0;

  // Pull Brain knowledge base (cached 5 min) — runs in parallel with CRM queries above
  const brainContext = await fetchBrainContext(8000);

  const systemPrompt = `You are the NxtGen Convergence AI Revenue Assistant — a sharp, direct revenue intelligence advisor embedded inside a B2B SaaS CRM dashboard. You have real-time access to this organisation's live data.
${brainContext ? `\nBRAIN KNOWLEDGE BASE (NxtGen product context & business rules):\n${brainContext}\n` : ""}
LIVE CRM SNAPSHOT (as of right now):
- Contacts: ${totalContacts} total | ${leads} leads | ${customers} customers | ${churned} churned | ${hotLeads} hot leads (score ≥70, not yet contacted)
- Pipeline: ${activeDeals.length} active deals | $${pipelineValue.toLocaleString()} pipeline value | ${winRate}% win rate
- Support: ${openTickets} open tickets${criticalTickets > 0 ? ` (${criticalTickets} CRITICAL)` : ""}
- Automation: ${activeWorkflows} active workflows | ${totalEnrolled} contacts enrolled
- Email: ${sentCampaigns.length} campaigns sent | ${totalSent.toLocaleString()} accepted sends | ${totalDelivered.toLocaleString()} provider-confirmed deliveries | ${avgOpenRate}% open rate on confirmed deliveries

RULES:
- Be direct and specific. Use only the numbers above and clearly distinguish configured scores from probabilities.
- Give actionable recommendations, not generic advice
- When you spot risks (churned contacts, critical tickets, hot leads sitting uncontacted), call them out proactively
- Keep responses concise — bullet points over paragraphs
- You can suggest actions like "send a win-back campaign", "contact these leads", "close the negotiation deals"
- Never make up data outside what's in the snapshot above`;

  try {
    const client = new Groq({ apiKey: process.env.GROQ_API_KEY });

    const response = await client.chat.completions.create({
      model: "llama-3.3-70b-versatile",
      max_tokens: 1024,
      messages: [
        { role: "system", content: systemPrompt },
        ...history,
        { role: "user", content: userMessage },
      ],
    });

    const reply = response.choices[0]?.message?.content ?? "";
    return NextResponse.json({ reply });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "AI request failed" }, { status: 500 });
  }
}

export const POST = withApiGuard(POSTHandler);
