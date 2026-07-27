import { NextRequest, NextResponse } from "next/server";

const TEMPLATES = [
  ["lead-nurture", "Lead Nurture Sequence", "Lead Generation", 7, "contact.created", "Guide new leads through a structured follow-up sequence"],
  ["trial-paid", "Trial to Paid Conversion", "Revenue", 12, "tag.added", "Convert active trials with behavior-based messages"],
  ["churn-prevention", "Churn Prevention", "Retention", 5, "contact.status_changed", "Intervene when an account becomes at risk"],
  ["onboarding", "Onboarding Journey", "Onboarding", 9, "contact.created", "Deliver a consistent customer onboarding experience"],
  ["win-back", "Win-back Campaign", "Re-engagement", 4, "contact.status_changed", "Reconnect with churned or inactive customers"],
  ["deal-follow-up", "Deal Follow-up", "Revenue", 3, "deal.stage_changed", "Keep negotiation-stage deals moving"],
  ["welcome", "Welcome Series", "Onboarding", 5, "contact.created", "Welcome new contacts and set expectations"],
  ["vip-upgrade", "VIP Upgrade Notification", "Customer Success", 2, "contact.score_changed", "Recognize high-value contacts automatically"],
  ["post-purchase", "Post-Purchase Survey", "Customer Success", 3, "deal.won", "Collect feedback after a successful purchase"],
  ["newsletter", "Monthly Newsletter Trigger", "Re-engagement", 1, "manual", "Prepare a repeatable monthly newsletter workflow"],
  ["abandoned-lead", "Abandoned Lead Rescue", "Lead Generation", 4, "contact.inactive", "Re-engage leads with no activity for 30 days"],
  ["referral", "Referral Request", "Revenue", 2, "nps.submitted", "Ask satisfied customers for a referral"],
].map(([id, name, category, count, event, description], index) => ({
  id, name, category, description, tags: [String(category).toLowerCase().replace(/\s+/g, "-")], color: ["brand", "violet", "emerald", "amber"][index % 4], estimatedTime: `${Math.max(3, Number(count) * 2)} min`,
  trigger: { event }, steps: Array.from({ length: Number(count) }, (_, i) => ({ type: i % 3 === 1 ? "delay" : "action", action: i % 3 === 1 ? "wait" : i === Number(count) - 1 ? "update_contact" : "send_email", delay: i % 3 === 1 ? "1 day" : undefined, config: {} })),
}));

export async function GET(request: NextRequest) {
  if (!request.headers.get("x-tenant-id")) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  return NextResponse.json({ data: TEMPLATES, total: TEMPLATES.length });
}
