import { NextRequest, NextResponse } from "next/server";
import { withApiGuard } from "@/lib/api-guard";

async function POSTHandler(_request: NextRequest) {
  return NextResponse.json({
    error: "Password changes are managed by NxtGen Space and are disabled here until the authenticated Space password contract is supplied and verified.",
    blocker: "space_password_contract",
    required: [
      "authenticated password change endpoint contract",
      "user identity claim or delegated Space session",
      "CSRF and reauthentication requirements",
      "success and failure response schema",
    ],
  }, { status: 503 });
}

export const POST = withApiGuard(POSTHandler);
