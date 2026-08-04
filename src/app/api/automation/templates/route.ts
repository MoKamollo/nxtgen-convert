import { NextResponse } from "next/server";
import { withApiGuard } from "@/lib/api-guard";

const TEMPLATES = [
  {
    id: "new-contact-follow-up",
    name: "New Contact Follow-up",
    category: "Lead Follow-up",
    description: "Send a consent-gated email, wait one day, and create a follow-up activity.",
    trigger: { event: "contact.created" },
    steps: [
      { type: "send_email", config: { subject: "Welcome", body: "Thank you for getting in touch.", purpose: "marketing" } },
      { type: "wait", config: { amount: 1, unit: "days" } },
      { type: "create_activity", config: { type: "task", subject: "Follow up with new contact" } },
    ],
    runtimeStatus: "implemented",
  },
  {
    id: "deal-stage-follow-up",
    name: "Deal Stage Follow-up",
    category: "Revenue Operations",
    description: "Create a follow-up activity when an implemented deal-stage event is received.",
    trigger: { event: "deal.stage_changed" },
    steps: [{ type: "create_activity", config: { type: "task", subject: "Review changed deal stage" } }],
    runtimeStatus: "implemented",
  },
];

async function GETHandler() { return NextResponse.json({ data: TEMPLATES, total: TEMPLATES.length }); }
export const GET = withApiGuard(GETHandler);
