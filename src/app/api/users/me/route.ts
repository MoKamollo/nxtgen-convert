import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { users, organizations } from "@/db/schema";
import { eq } from "drizzle-orm";

export async function GET(request: NextRequest) {
  const tenantId = request.headers.get("x-tenant-id");
  const userId   = request.headers.get("x-user-id");
  const role     = request.headers.get("x-user-role");

  if (!tenantId) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const [org] = await db
    .select({ id: organizations.id, name: organizations.name, plan: organizations.plan })
    .from(organizations)
    .where(eq(organizations.id, tenantId))
    .limit(1);

  let user = null;
  if (userId) {
    const rows = await db
      .select({ id: users.id, name: users.name, email: users.email, jobTitle: users.jobTitle, avatar: users.avatar })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);
    user = rows[0] ?? null;
  }

  return NextResponse.json({
    tenantId,
    role,
    org: org ?? null,
    user: user ?? null,
  });
}

export async function PATCH(request: NextRequest) {
  const tenantId = request.headers.get("x-tenant-id");
  const userId   = request.headers.get("x-user-id");

  if (!tenantId || !userId) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const body = await request.json();
  const allowed = ["name", "jobTitle", "phone", "timezone"] as const;
  const updates: Partial<Record<typeof allowed[number], string>> = {};
  for (const key of allowed) {
    if (body[key] !== undefined) updates[key] = body[key];
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: "No valid fields to update" }, { status: 400 });
  }

  await db.update(users).set(updates).where(eq(users.id, userId));
  return NextResponse.json({ ok: true });
}
