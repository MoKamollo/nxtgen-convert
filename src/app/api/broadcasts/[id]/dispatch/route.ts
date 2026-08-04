import { NextRequest, NextResponse } from "next/server";
import { withTenantDatabase } from "@/db";
import { CampaignSendError, sendCampaign } from "@/lib/campaign-send";
import { verifyQStashRequest } from "@/lib/qstash";

export const runtime = "nodejs";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const rawBody = await request.text();
    verifyQStashRequest(request.headers.get("upstash-signature"), rawBody, request.url);
    const body = JSON.parse(rawBody) as { organizationId?: string };
    const organizationId = body.organizationId;
    if (!organizationId) {
      return NextResponse.json({ error: "Missing organization" }, { status: 400 });
    }
    const { id } = await params;
    return NextResponse.json(await withTenantDatabase(organizationId, () => sendCampaign(organizationId, id)));
  } catch (error) {
    console.error("[broadcast-dispatch]", error);
    const status = error instanceof CampaignSendError ? error.status : 401;
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Dispatch failed" },
      { status },
    );
  }
}
