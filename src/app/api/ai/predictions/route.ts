import { withApiGuard } from "@/lib/api-guard";
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { contacts, deals } from "@/db/schema";
import { eq } from "drizzle-orm";

const OPEN_STAGES = new Set(["prospecting", "qualification", "proposal", "negotiation"]);
const RULE_VERSION = "customer-signals-v1";

async function GETHandler(request: NextRequest) {
  const orgId = request.headers.get("x-tenant-id")!;
  const [contactRows, dealRows] = await Promise.all([
    db.select().from(contacts).where(eq(contacts.organizationId, orgId)),
    db.select().from(deals).where(eq(deals.organizationId, orgId)),
  ]);
  const now = Date.now();
  const openDealContacts = new Set(dealRows.filter((deal) => OPEN_STAGES.has(deal.stage ?? "")).map((deal) => deal.contactId).filter(Boolean));

  const retentionAttention = contactRows
    .filter((contact) => ["customer", "vip"].includes(contact.status ?? "") && (contact.score ?? 0) < 50 && (!contact.lastContactedAt || now - new Date(contact.lastContactedAt).getTime() > 60 * 86_400_000))
    .map((contact) => ({
      ...contact,
      daysSinceContact: contact.lastContactedAt ? Math.floor((now - new Date(contact.lastContactedAt).getTime()) / 86_400_000) : null,
      reasonCodes: ["customer_status", "score_below_50", contact.lastContactedAt ? "inactive_over_60_days" : "never_contacted"],
    }));
  const qualifiedLeadSignals = contactRows
    .filter((contact) => contact.status === "lead" && (contact.score ?? 0) >= 60 && Boolean(contact.email) && Boolean(contact.phone || contact.mobile))
    .sort((a, b) => (b.score ?? 0) - (a.score ?? 0))
    .map((contact) => ({ ...contact, reasonCodes: ["lead_status", "score_at_least_60", "email_present", "phone_present"] }));
  const closingWindow = dealRows
    .filter((deal) => ["proposal", "negotiation"].includes(deal.stage ?? "") && deal.expectedCloseDate && new Date(deal.expectedCloseDate).getTime() >= now && new Date(deal.expectedCloseDate).getTime() <= now + 30 * 86_400_000)
    .sort((a, b) => new Date(a.expectedCloseDate!).getTime() - new Date(b.expectedCloseDate!).getTime())
    .map((deal) => ({ ...deal, configuredProbability: deal.probability ?? null, reasonCodes: ["proposal_or_negotiation", "expected_close_within_30_days"] }));
  const expansionCandidates = contactRows
    .filter((contact) => ["customer", "vip"].includes(contact.status ?? "") && (contact.score ?? 0) > 70 && !openDealContacts.has(contact.id))
    .sort((a, b) => (b.score ?? 0) - (a.score ?? 0))
    .map((contact) => ({ ...contact, reasonCodes: ["customer_status", "score_above_70", "no_open_deal"] }));

  return NextResponse.json({
    data: { retentionAttention, qualifiedLeadSignals, closingWindow, expansionCandidates },
    methodology: {
      kind: "deterministic_rules",
      ruleVersion: RULE_VERSION,
      disclaimer: "These are explainable rule matches, not predictions, probabilities, or machine learning outputs.",
    },
  });
}

export const GET = withApiGuard(GETHandler);
