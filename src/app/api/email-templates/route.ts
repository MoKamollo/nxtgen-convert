import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { emailTemplates } from "@/db/schema";
import { desc, eq } from "drizzle-orm";

const SYSTEM_TEMPLATES = [
  { id: "system:welcome", name: "Welcome Email", subject: "Welcome, {{first_name}}", preheader: "Everything you need to get started", category: "transactional", tags: ["welcome", "onboarding"], htmlContent: "<h1>Welcome, {{first_name}}</h1><p>We are glad you are here.</p><p><a href=\"{{unsubscribe_url}}\">Unsubscribe</a></p>" },
  { id: "system:winback", name: "Win-back Campaign", subject: "We would love to see you again", preheader: "A quick note from our team", category: "campaign", tags: ["retention"], htmlContent: "<h1>We miss you, {{first_name}}</h1><p>Here is what is new.</p><p><a href=\"{{unsubscribe_url}}\">Unsubscribe</a></p>" },
  { id: "system:nps", name: "NPS Survey", subject: "How are we doing?", preheader: "One question, less than a minute", category: "transactional", tags: ["nps", "feedback"], htmlContent: "<h1>How likely are you to recommend us?</h1><p>Your feedback helps us improve.</p>" },
  { id: "system:announcement", name: "Product Announcement", subject: "Introducing something new", preheader: "A product update for you", category: "announcement", tags: ["product"], htmlContent: "<h1>Introducing our latest update</h1><p>Here is what changed.</p><p><a href=\"{{unsubscribe_url}}\">Unsubscribe</a></p>" },
  { id: "system:newsletter", name: "Monthly Newsletter", subject: "Your monthly update", preheader: "News, insights, and highlights", category: "newsletter", tags: ["newsletter"], htmlContent: "<h1>This month at our company</h1><p>Here are the highlights.</p><p><a href=\"{{unsubscribe_url}}\">Unsubscribe</a></p>" },
].map(template => ({ ...template, isSystem: true, createdAt: null, updatedAt: null }));

export async function GET(request: NextRequest) {
  const orgId = request.headers.get("x-tenant-id");
  if (!orgId) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  try {
    const rows = await db.select().from(emailTemplates).where(eq(emailTemplates.organizationId, orgId)).orderBy(desc(emailTemplates.updatedAt));
    return NextResponse.json({ data: [...SYSTEM_TEMPLATES, ...rows.map(row => ({ ...row, isSystem: false }))], total: SYSTEM_TEMPLATES.length + rows.length });
  } catch {
    return NextResponse.json({ error: "Failed to fetch email templates" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const orgId = request.headers.get("x-tenant-id");
  const userId = request.headers.get("x-user-id");
  if (!orgId) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  try {
    const body = await request.json();
    const name = String(body.name ?? "").trim();
    const subject = String(body.subject ?? "").trim();
    if (!name || !subject) return NextResponse.json({ error: "Name and subject are required" }, { status: 400 });
    const [created] = await db.insert(emailTemplates).values({
      organizationId: orgId,
      name,
      subject,
      preheader: body.preheader ? String(body.preheader) : null,
      htmlContent: String(body.htmlContent ?? ""),
      category: String(body.category ?? "other"),
      tags: Array.isArray(body.tags) ? body.tags.map(String) : [],
      createdById: userId || null,
    }).returning();
    return NextResponse.json({ data: { ...created, isSystem: false } }, { status: 201 });
  } catch {
    return NextResponse.json({ error: "Failed to create email template" }, { status: 500 });
  }
}
