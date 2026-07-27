import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { users, organizations } from "@/db/schema";
import { and, eq } from "drizzle-orm";

export async function GET(request: NextRequest) {
  const tenantId = request.headers.get("x-tenant-id");
  const userId = request.headers.get("x-user-id");
  const role = request.headers.get("x-user-role");

  if (!tenantId) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  try {
    const [org] = await db
      .select({ id: organizations.id, name: organizations.name, plan: organizations.plan })
      .from(organizations)
      .where(eq(organizations.id, tenantId))
      .limit(1);

    let user = null;
    if (userId) {
      const rows = await db
        .select({
          id: users.id,
          name: users.name,
          email: users.email,
          jobTitle: users.jobTitle,
          phone: users.phone,
          timezone: users.timezone,
          avatar: users.avatar,
          preferences: users.preferences,
        })
        .from(users)
        .where(and(eq(users.id, userId), eq(users.organizationId, tenantId)))
        .limit(1);
      user = rows[0] ?? null;
    }

    return NextResponse.json({ tenantId, role, org: org ?? null, user });
  } catch {
    return NextResponse.json({ error: "Failed to fetch user" }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  const tenantId = request.headers.get("x-tenant-id");
  const userId = request.headers.get("x-user-id");
  if (!tenantId || !userId) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  try {
    const body = await request.json();
    const [current] = await db
      .select({ preferences: users.preferences })
      .from(users)
      .where(and(eq(users.id, userId), eq(users.organizationId, tenantId)))
      .limit(1);
    if (!current) return NextResponse.json({ error: "User not found" }, { status: 404 });

    const updates: Record<string, unknown> = {};
    for (const key of ["name", "jobTitle", "phone", "timezone"] as const) {
      if (body[key] !== undefined) updates[key] = body[key];
    }
    if (body.notifications !== undefined || body.appearance !== undefined) {
      updates.preferences = {
        ...((current.preferences ?? {}) as Record<string, unknown>),
        ...(body.notifications !== undefined ? { notifications: body.notifications } : {}),
        ...(body.appearance !== undefined ? { appearance: body.appearance } : {}),
      };
    }
    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ error: "No valid fields to update" }, { status: 400 });
    }

    await db.update(users).set({ ...updates, updatedAt: new Date() }).where(and(eq(users.id, userId), eq(users.organizationId, tenantId)));
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "Failed to update user" }, { status: 500 });
  }
}
