import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { contacts, deals } from "@/db/schema";
import { eq } from "drizzle-orm";

const OPEN_STAGES = new Set(["prospecting", "qualification", "proposal", "negotiation"]);
const STAGE_PROBABILITIES: Record<string, number> = { prospecting: 15, qualification: 35, proposal: 60, negotiation: 80, closed_won: 100, closed_lost: 0 };

export async function GET(request: NextRequest) {
  const orgId = request.headers.get("x-tenant-id");
  if (!orgId) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  try {
    const [contactRows, dealRows] = await Promise.all([
      db.select().from(contacts).where(eq(contacts.organizationId, orgId)),
      db.select().from(deals).where(eq(deals.organizationId, orgId)),
    ]);
    const now = Date.now();
    const openDealContacts = new Set(dealRows.filter(deal => OPEN_STAGES.has(deal.stage ?? "")).map(deal => deal.contactId).filter(Boolean));
    const churnRisks = contactRows
      .filter(contact => ["customer", "vip"].includes(contact.status ?? "") && (contact.score ?? 0) < 50 && (!contact.lastContactedAt || now - new Date(contact.lastContactedAt).getTime() > 60 * 86400000))
      .map(contact => ({ ...contact, risk: "high", daysSinceContact: contact.lastContactedAt ? Math.floor((now - new Date(contact.lastContactedAt).getTime()) / 86400000) : null }));
    const conversionCandidates = contactRows
      .filter(contact => contact.status === "lead" && (contact.score ?? 0) >= 60 && Boolean(contact.email) && Boolean(contact.phone || contact.mobile))
      .sort((a, b) => (b.score ?? 0) - (a.score ?? 0))
      .map(contact => ({ ...contact, likelihood: Math.min(95, Math.max(60, contact.score ?? 60)) }));
    const closingSoon = dealRows
      .filter(deal => ["proposal", "negotiation"].includes(deal.stage ?? "") && deal.expectedCloseDate && new Date(deal.expectedCloseDate).getTime() >= now && new Date(deal.expectedCloseDate).getTime() <= now + 30 * 86400000)
      .sort((a, b) => new Date(a.expectedCloseDate!).getTime() - new Date(b.expectedCloseDate!).getTime())
      .map(deal => ({ ...deal, forecastProbability: deal.probability || STAGE_PROBABILITIES[deal.stage ?? ""] || 0 }));
    const upsellOpportunities = contactRows
      .filter(contact => ["customer", "vip"].includes(contact.status ?? "") && (contact.score ?? 0) > 70 && !openDealContacts.has(contact.id))
      .sort((a, b) => (b.score ?? 0) - (a.score ?? 0));
    return NextResponse.json({ data: { churnRisks, conversionCandidates, closingSoon, upsellOpportunities, stageProbabilities: STAGE_PROBABILITIES } });
  } catch {
    return NextResponse.json({ error: "Failed to generate predictions" }, { status: 500 });
  }
}
