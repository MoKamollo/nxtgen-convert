import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { activities, contacts, notifications } from "@/db/schema";
import { and, count, desc, eq } from "drizzle-orm";

function metadataRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

export async function GET(request: NextRequest) {
  const orgId = request.headers.get("x-tenant-id");
  const userId = request.headers.get("x-user-id");
  if (!orgId || !userId) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  try {
    const type = request.nextUrl.searchParams.get("type");
    const unreadOnly = request.nextUrl.searchParams.get("unread") === "true";
    if (type && type !== "email" && type !== "notification") {
      return NextResponse.json({ error: "Invalid inbox type" }, { status: 400 });
    }

    const emailRows = type === "notification" ? [] : await db
      .select({
        id: activities.id,
        subject: activities.subject,
        body: activities.body,
        contactId: activities.contactId,
        userId: activities.userId,
        metadata: activities.metadata,
        createdAt: activities.createdAt,
        contactFirstName: contacts.firstName,
        contactLastName: contacts.lastName,
        contactEmail: contacts.email,
      })
      .from(activities)
      .leftJoin(contacts, and(eq(activities.contactId, contacts.id), eq(contacts.organizationId, orgId)))
      .where(and(eq(activities.organizationId, orgId), eq(activities.type, "email")))
      .orderBy(desc(activities.createdAt))
      .limit(200);

    const emails = emailRows.map(({ contactFirstName, contactLastName, metadata, ...row }) => {
      const meta = metadataRecord(metadata);
      const readBy = Array.isArray(meta.readBy) ? meta.readBy.filter((id): id is string => typeof id === "string") : [];
      const direction = meta.direction === "inbound" ? "inbound" : "outbound";
      const read = direction === "outbound" || readBy.includes(userId);
      return {
        ...row,
        metadata: meta,
        direction,
        read,
        contactName: contactFirstName
          ? `${contactFirstName} ${contactLastName ?? ""}`.trim()
          : row.contactEmail ?? "Unknown Contact",
      };
    }).filter((row) => !unreadOnly || !row.read);

    const notificationRows = type === "email" ? [] : await db
      .select()
      .from(notifications)
      .where(and(
        eq(notifications.organizationId, orgId),
        eq(notifications.userId, userId),
        ...(unreadOnly ? [eq(notifications.read, false)] : []),
      ))
      .orderBy(desc(notifications.createdAt))
      .limit(100);

    const unreadEmailCount = emailRows.reduce((count, row) => {
      const meta = metadataRecord(row.metadata);
      const readBy = Array.isArray(meta.readBy) ? meta.readBy : [];
      return count + (meta.direction === "inbound" && !readBy.includes(userId) ? 1 : 0);
    }, 0);

    const [notificationCount] = await db
      .select({ value: count() })
      .from(notifications)
      .where(and(
        eq(notifications.organizationId, orgId),
        eq(notifications.userId, userId),
        eq(notifications.read, false),
      ));

    return NextResponse.json({
      emails,
      notifications: notificationRows,
      unreadCount: unreadEmailCount + Number(notificationCount?.value ?? 0),
    });
  } catch (error) {
    console.error("GET /api/inbox failed", error);
    return NextResponse.json({ error: "Failed to load inbox" }, { status: 500 });
  }
}
