import { NextRequest, NextResponse } from "next/server";
import { CampaignSendError, sendCampaign } from "@/lib/campaign-send";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const orgId = request.headers.get("x-tenant-id");
  if (!orgId) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  try {
    const { id } = await params;
    return NextResponse.json(await sendCampaign(orgId, id));
  } catch (error) {
    console.error("[campaign-send]", error);
    const status = error instanceof CampaignSendError ? error.status : 500;
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to send campaign" },
      { status },
    );
  }
}
