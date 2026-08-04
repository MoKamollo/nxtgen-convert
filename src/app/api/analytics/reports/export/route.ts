import { withApiGuard } from "@/lib/api-guard";
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { campaigns, contacts, deals } from "@/db/schema";
import { eq } from "drizzle-orm";

function csv(rows: Record<string, unknown>[]) {
  if (rows.length === 0) return "";
  const headers = Object.keys(rows[0]);
  const escape = (value: unknown) => `"${String(value ?? "").replace(/"/g, '""')}"`;
  return [headers.map(escape).join(","), ...rows.map(row => headers.map(header => escape(typeof row[header] === "object" ? JSON.stringify(row[header]) : row[header])).join(","))].join("\n");
}

async function POSTHandler(request: NextRequest) {
  const orgId = request.headers.get("x-tenant-id");
  if (!orgId) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  try {
    const body = await request.json();
    const type = String(body.type ?? "");
    let rows: Record<string, unknown>[];
    if (type === "contacts") rows = await db.select().from(contacts).where(eq(contacts.organizationId, orgId));
    else if (type === "deals" || type === "revenue") rows = await db.select().from(deals).where(eq(deals.organizationId, orgId));
    else if (type === "campaigns") rows = await db.select().from(campaigns).where(eq(campaigns.organizationId, orgId));
    else return NextResponse.json({ error: "Unsupported report type" }, { status: 400 });
    return new NextResponse(csv(rows), { status: 200, headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename=convert-${type}-${new Date().toISOString().slice(0, 10)}.csv` } });
  } catch {
    return NextResponse.json({ error: "Failed to export report" }, { status: 500 });
  }
}

export const POST = withApiGuard(POSTHandler);
