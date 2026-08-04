import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { contactIdentityKeys, identityResolutionCandidates } from "@/db/schema";
import { hashIdentity, identityHint, normalizeIdentity, type IdentityType } from "@/lib/identity-values";

export { hashIdentity, identityHint, normalizeIdentity, type IdentityType } from "@/lib/identity-values";

function canonicalPair(a: string, b: string): [string, string] {
  return a.localeCompare(b) <= 0 ? [a, b] : [b, a];
}

export async function findIdentityOwner(organizationId: string, type: IdentityType, rawValue: string) {
  const normalized = normalizeIdentity(type, rawValue);
  const valueHash = hashIdentity(type, normalized);
  const [existing] = await db.select({ contactId: contactIdentityKeys.contactId })
    .from(contactIdentityKeys)
    .where(and(
      eq(contactIdentityKeys.organizationId, organizationId),
      eq(contactIdentityKeys.identityType, type),
      eq(contactIdentityKeys.valueHash, valueHash),
      eq(contactIdentityKeys.active, true),
    )).limit(1);
  return { normalized, valueHash, contactId: existing?.contactId ?? null };
}

export async function syncContactIdentity(input: {
  organizationId: string;
  contactId: string;
  type: IdentityType;
  rawValue: string | null | undefined;
  source: string;
  verified?: boolean;
}) {
  if (!input.rawValue?.trim()) {
    await db.update(contactIdentityKeys).set({ active: false, lastSeenAt: new Date() }).where(and(
      eq(contactIdentityKeys.organizationId, input.organizationId),
      eq(contactIdentityKeys.contactId, input.contactId),
      eq(contactIdentityKeys.identityType, input.type),
      eq(contactIdentityKeys.active, true),
    ));
    return { status: "removed" as const };
  }

  const normalized = normalizeIdentity(input.type, input.rawValue);
  const valueHash = hashIdentity(input.type, normalized);
  const [existing] = await db.select({ id: contactIdentityKeys.id, contactId: contactIdentityKeys.contactId })
    .from(contactIdentityKeys)
    .where(and(
      eq(contactIdentityKeys.organizationId, input.organizationId),
      eq(contactIdentityKeys.identityType, input.type),
      eq(contactIdentityKeys.valueHash, valueHash),
    )).limit(1);

  if (existing && existing.contactId !== input.contactId) {
    const [leftContactId, rightContactId] = canonicalPair(existing.contactId, input.contactId);
    await db.insert(identityResolutionCandidates).values({
      organizationId: input.organizationId,
      leftContactId,
      rightContactId,
      identityType: input.type,
      identityHash: valueHash,
      reason: `Exact normalized ${input.type} match`,
      confidence: "100.00",
      status: "pending",
      evidence: { match: "exact", displayHint: identityHint(input.type, normalized) },
    }).onConflictDoNothing();
    return { status: "conflict" as const, conflictingContactId: existing.contactId };
  }

  await db.update(contactIdentityKeys).set({ active: false, lastSeenAt: new Date() }).where(and(
    eq(contactIdentityKeys.organizationId, input.organizationId),
    eq(contactIdentityKeys.contactId, input.contactId),
    eq(contactIdentityKeys.identityType, input.type),
    eq(contactIdentityKeys.active, true),
  ));

  if (existing) {
    await db.update(contactIdentityKeys).set({
      active: true,
      displayHint: identityHint(input.type, normalized),
      source: input.source,
      verified: input.verified ?? false,
      lastSeenAt: new Date(),
    }).where(and(eq(contactIdentityKeys.organizationId, input.organizationId), eq(contactIdentityKeys.id, existing.id)));
  } else {
    await db.insert(contactIdentityKeys).values({
      organizationId: input.organizationId,
      contactId: input.contactId,
      identityType: input.type,
      valueHash,
      displayHint: identityHint(input.type, normalized),
      source: input.source,
      verified: input.verified ?? false,
      active: true,
    });
  }
  return { status: "linked" as const };
}
