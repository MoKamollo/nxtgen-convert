import { NextRequest, NextResponse } from "next/server";
import { withTenantDatabase } from "@/db";
import { processEnrollmentById } from "@/lib/automation";
import { verifyQStashRequest } from "@/lib/qstash";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const rawBody = await request.text();
    verifyQStashRequest(request.headers.get("upstash-signature"), rawBody, request.url);
    const body = JSON.parse(rawBody) as { organizationId?: string };
    const organizationId = body.organizationId;
    if (!organizationId) return NextResponse.json({ error: "Missing tenant context" }, { status: 400 });
    const { id } = await params;
    return NextResponse.json(await withTenantDatabase(organizationId, () => processEnrollmentById(id, organizationId)));
  } catch (error) {
    console.error("[automation.resume]", error);
    return NextResponse.json({ error: error instanceof Error ? error.message : "Resume failed" }, { status: 401 });
  }
}
