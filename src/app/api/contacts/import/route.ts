import { withApiGuard } from "@/lib/api-guard";
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { companies, contactLifecycleHistory, contacts } from "@/db/schema";
import { and, eq, ilike, isNull } from "drizzle-orm";
import { hashIdentity, normalizeIdentity, syncContactIdentity } from "@/lib/identity-resolution";
import { recordCustomerTimelineEvent } from "@/lib/customer-timeline";

const VALID_STATUSES = ["lead","prospect","customer","vip","churned"];

type ContactStatus = "lead" | "prospect" | "customer" | "vip" | "churned";

type ContactRow = {
  firstName: string; lastName?: string; email?: string; phone?: string;
  status?: ContactStatus; jobTitle?: string; company?: string; source?: string;
};

function normalizeHeader(h: string): string {
  return h.trim().toLowerCase().replace(/[\s_-]+/g, "");
}

const HEADER_MAP: Record<string, keyof ContactRow> = {
  firstname:  "firstName",
  first:      "firstName",
  name:       "firstName",
  lastname:   "lastName",
  last:       "lastName",
  surname:    "lastName",
  email:      "email",
  emailaddress: "email",
  phone:      "phone",
  mobile:     "phone",
  telephone:  "phone",
  status:     "status",
  jobtitle:   "jobTitle",
  title:      "jobTitle",
  position:   "jobTitle",
  company:    "company",
  organization: "company",
  organisation: "company",
  source:     "source",
  leadsource: "source",
};

function calcScore(data: { email?: string | null; phone?: string | null; jobTitle?: string | null; source?: string | null; status?: string | null }): number {
  const statusBase: Record<string, number> = { vip: 90, customer: 70, prospect: 45, lead: 25, churned: 10 };
  const sourceBonus: Record<string, number> = { referral: 15, organic: 10, event: 8, paid_ads: 5, cold_outreach: 2, other: 3 };
  let score = statusBase[data.status ?? "lead"] ?? 25;
  if (data.email) score += 10;
  if (data.phone) score += 5;
  if (data.jobTitle) score += 5;
  score += sourceBonus[data.source ?? ""] ?? 0;
  return Math.min(score, 100);
}

function parseCSV(text: string): string[][] {
  const rows: string[][] = [];
  let current = "";
  let inQuotes = false;
  let row: string[] = [];

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch === '"') {
      if (inQuotes && text[i + 1] === '"') { current += '"'; i++; }
      else inQuotes = !inQuotes;
    } else if (ch === "," && !inQuotes) {
      row.push(current.trim()); current = "";
    } else if ((ch === "\n" || ch === "\r") && !inQuotes) {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      row.push(current.trim()); current = "";
      if (row.some(c => c !== "")) rows.push(row);
      row = [];
    } else {
      current += ch;
    }
  }
  if (current || row.length) { row.push(current.trim()); if (row.some(c => c !== "")) rows.push(row); }
  return rows;
}

async function POSTHandler(request: NextRequest) {
  const orgId = request.headers.get("x-tenant-id");
  if (!orgId) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  try {
    const formData = await request.formData();
    const file = formData.get("file") as File | null;
    if (!file) return NextResponse.json({ error: "No file provided" }, { status: 400 });

    const text = await file.text();
    const rows = parseCSV(text);
    if (rows.length < 2) return NextResponse.json({ error: "CSV must have a header row and at least one data row" }, { status: 400 });

    const headers = rows[0].map(normalizeHeader);
    const fieldMap = headers.map(h => HEADER_MAP[h] ?? null);

    if (!fieldMap.includes("firstName")) {
      return NextResponse.json({ error: "CSV must include a 'First Name' or 'Name' column" }, { status: 400 });
    }

    const toInsert: ContactRow[] = [];
    const skipped: number[] = [];
    const existingEmailRows = await db.select({ email: contacts.email }).from(contacts).where(and(
      eq(contacts.organizationId, orgId),
      isNull(contacts.archivedAt),
    ));
    const existingEmails = new Set(existingEmailRows.map((row) => row.email?.trim().toLowerCase()).filter((email): email is string => Boolean(email)));
    const fileEmails = new Set<string>();

    for (let i = 1; i < rows.length; i++) {
      const row = rows[i];
      const record: Partial<ContactRow> = {};
      row.forEach((val, idx) => {
        const field = fieldMap[idx];
        if (field && val) (record as Record<string, string>)[field] = val;
      });
      if (!record.firstName) { skipped.push(i + 1); continue; }
      if (record.email) {
        try { record.email = normalizeIdentity("email", record.email); } catch { skipped.push(i + 1); continue; }
        if (existingEmails.has(record.email) || fileEmails.has(record.email)) { skipped.push(i + 1); continue; }
        fileEmails.add(record.email);
      }
      if (record.phone) {
        try { record.phone = normalizeIdentity("phone", record.phone); } catch { skipped.push(i + 1); continue; }
      }
      if (record.status) {
        const normalized = record.status.toLowerCase();
        if (!VALID_STATUSES.includes(normalized)) {
          skipped.push(i + 1); // reject row — don't silently coerce invalid status
          continue;
        }
        record.status = normalized as ContactStatus;
      }
      toInsert.push(record as ContactRow);
    }

    if (toInsert.length === 0) {
      return NextResponse.json({ error: "No valid rows found", skipped }, { status: 400 });
    }
    const firstIdentity = toInsert.find((row) => row.email || row.phone);
    if (firstIdentity?.email) hashIdentity("email", firstIdentity.email);
    else if (firstIdentity?.phone) hashIdentity("phone", firstIdentity.phone);

    const companyIds = new Map<string, string>();
    for (const companyName of [...new Set(toInsert.map(row => row.company?.trim()).filter((name): name is string => Boolean(name)))]) {
      const existing = await db.select({ id: companies.id }).from(companies)
        .where(and(eq(companies.organizationId, orgId), ilike(companies.name, companyName))).limit(1);
      if (existing[0]) companyIds.set(companyName.toLowerCase(), existing[0].id);
      else {
        const [created] = await db.insert(companies).values({ organizationId: orgId, name: companyName }).returning({ id: companies.id });
        companyIds.set(companyName.toLowerCase(), created.id);
      }
    }

    // Batch insert in chunks of 100
    let inserted = 0;
    const chunkSize = 100;
    for (let i = 0; i < toInsert.length; i += chunkSize) {
      const chunk = toInsert.slice(i, i + chunkSize);
      const created = await db.insert(contacts).values(
        chunk.map(c => ({
          organizationId: orgId,
          firstName: c.firstName,
          lastName: c.lastName ?? null,
          email: c.email ?? null,
          phone: c.phone ?? null,
          status: c.status ?? "lead",
          jobTitle: c.jobTitle ?? null,
          companyId: c.company ? companyIds.get(c.company.trim().toLowerCase()) ?? null : null,
          source: c.source ?? "import",
          score: calcScore({ email: c.email, phone: c.phone, jobTitle: c.jobTitle, source: c.source ?? "import", status: c.status ?? "lead" }),
          tags: [],
        }))
      ).returning({ id: contacts.id, email: contacts.email, phone: contacts.phone, status: contacts.status, source: contacts.source, createdAt: contacts.createdAt });
      for (const contact of created) {
        await syncContactIdentity({ organizationId: orgId, contactId: contact.id, type: "email", rawValue: contact.email, source: "csv_import" });
        await syncContactIdentity({ organizationId: orgId, contactId: contact.id, type: "phone", rawValue: contact.phone, source: "csv_import" });
        await db.insert(contactLifecycleHistory).values({
          organizationId: orgId, contactId: contact.id, fromStage: null, toStage: contact.status ?? "lead", source: "csv_import",
          actorUserId: request.headers.get("x-user-id"),
        });
        await recordCustomerTimelineEvent({
          organizationId: orgId, contactId: contact.id, sourceType: "contact", sourceId: contact.id,
          eventType: "contact.imported", summary: "Contact imported from CSV", actorUserId: request.headers.get("x-user-id"),
          idempotencyKey: `contact.imported:${contact.id}`, metadata: { source: contact.source }, occurredAt: contact.createdAt,
        });
      }
      inserted += created.length;
    }

    return NextResponse.json({ inserted, skipped: skipped.length, total: toInsert.length + skipped.length });
  } catch (err) {
    console.error("[contacts/import]", err);
    if (err instanceof Error && err.message.includes("IDENTITY_HASHING_SECRET")) return NextResponse.json({ error: "Identity resolution is not configured" }, { status: 503 });
    return NextResponse.json({ error: "Failed to process CSV" }, { status: 500 });
  }
}

export const POST = withApiGuard(POSTHandler);
