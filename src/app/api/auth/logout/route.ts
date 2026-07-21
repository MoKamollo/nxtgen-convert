import { NextResponse } from "next/server";
import { clearCookieHeader } from "@/lib/session";

export async function POST() {
  const response = NextResponse.json({ ok: true });
  response.headers.set("Set-Cookie", clearCookieHeader());
  return response;
}
