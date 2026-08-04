import { and, eq } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { connectorAccounts } from "@/db/schema";
import { withApiGuard } from "@/lib/api-guard";

const CATALOG: Record<string, { implementation: string; required: string[] }> = {
  gmail: { implementation: "oauth_required", required: ["Google OAuth client", "Gmail API access", "owner authorization"] },
  outlook: { implementation: "oauth_required", required: ["Microsoft Entra application", "Graph API permissions", "owner authorization"] },
  slack: { implementation: "oauth_required", required: ["Slack application", "bot scopes", "workspace authorization"] },
  "google-calendar": { implementation: "oauth_required", required: ["Google OAuth client", "Calendar API access", "owner authorization"] },
  zapier: { implementation: "partner_approval_required", required: ["Zapier integration approval or private app credentials"] },
  postgresql: { implementation: "credential_required", required: ["Dedicated least privilege database credentials", "network allowlist"] },
};

async function GETHandler(request: NextRequest, { params }: { params: Promise<{ name: string }> }) {
  const orgId = request.headers.get("x-tenant-id")!;
  const { name } = await params;
  const catalog = CATALOG[name];
  if (!catalog) return NextResponse.json({ error: "Unsupported integration" }, { status: 404 });
  const [account] = await db.select({
    provider: connectorAccounts.provider,
    status: connectorAccounts.status,
    healthStatus: connectorAccounts.healthStatus,
    displayName: connectorAccounts.displayName,
    scopes: connectorAccounts.scopes,
    lastVerifiedAt: connectorAccounts.lastVerifiedAt,
    lastSyncAt: connectorAccounts.lastSyncAt,
    lastError: connectorAccounts.lastError,
  }).from(connectorAccounts).where(and(eq(connectorAccounts.organizationId, orgId), eq(connectorAccounts.provider, name))).limit(1);
  return NextResponse.json({ data: account ?? { provider: name, status: "disconnected", healthStatus: "not_configured" }, requirements: catalog.required });
}

async function POSTHandler(_request: NextRequest, { params }: { params: Promise<{ name: string }> }) {
  const { name } = await params;
  const catalog = CATALOG[name];
  if (!catalog) return NextResponse.json({ error: "Unsupported integration" }, { status: 404 });
  return NextResponse.json({
    error: "This connector cannot be marked connected without completing provider authentication and validation.",
    status: "blocked_external_dependency",
    requirements: catalog.required,
  }, { status: 409 });
}

export const GET = withApiGuard(GETHandler);
export const POST = withApiGuard(POSTHandler);
