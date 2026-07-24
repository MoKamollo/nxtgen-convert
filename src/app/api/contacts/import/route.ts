import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { contacts } from "@/db/schema";

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

export async function POST(request: NextRequest) {
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

    for (let i = 1; i < rows.length; i++) {
      const row = rows[i];
      const record: Partial<ContactRow> = {};
      row.forEach((val, idx) => {
        const field = fieldMap[idx];
        if (field && val) (record as Record<string, string>)[field] = val;
      });
      if (!record.firstName) { skipped.push(i + 1); continue; }
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

    // Batch insert in chunks of 100
    let inserted = 0;
    const chunkSize = 100;
    for (let i = 0; i < toInsert.length; i += chunkSize) {
      const chunk = toInsert.slice(i, i + chunkSize);
      await db.insert(contacts).values(
        chunk.map(c => ({
          organizationId: orgId,
          firstName: c.firstName,
          lastName: c.lastName ?? null,
          email: c.email ?? null,
          phone: c.phone ?? null,
          status: c.status ?? "lead",
          jobTitle: c.jobTitle ?? null,
          company: c.company ?? null,
          source: c.source ?? "import",
          score: calcScore({ email: c.email, phone: c.phone, jobTitle: c.jobTitle, source: c.source ?? "import", status: c.status ?? "lead" }),
          tags: [],
        }))
      );
      inserted += chunk.length;
    }

    return NextResponse.json({ inserted, skipped: skipped.length, total: toInsert.length + skipped.length });
  } catch (err) {
    console.error("[contacts/import]", err);
    return NextResponse.json({ error: "Failed to process CSV" }, { status: 500 });
  }
}
