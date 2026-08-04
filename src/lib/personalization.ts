import { createHmac } from "crypto";
import { and, desc, eq, gt, isNull, lt, or } from "drizzle-orm";
import { db } from "@/db";
import {
  contacts,
  customerSegments,
  personalizationActiveVersions,
  personalizationAssignments,
  personalizationExperiences,
  personalizationExperienceVersions,
} from "@/db/schema";
import { chooseExperimentVariant } from "@/lib/journey-runtime";
import { activeSegmentDefinition, contactMatchesSegment } from "@/lib/segments";
import { personalizationDefinitionChecksum, validatePersonalizationDefinition, type PersonalizationDefinition, type PersonalizationVariant } from "@/lib/personalization-definition";

function hashingSecret(): string {
  const secret = process.env.PERSONALIZATION_HASHING_SECRET;
  if (!secret || secret.length < 32) throw new Error("PERSONALIZATION_HASHING_SECRET must be configured with at least 32 characters");
  return secret;
}

export function personalizationSubjectHash(organizationId: string, subjectKey: string): string {
  return createHmac("sha256", hashingSecret()).update(`${organizationId}:${subjectKey}`).digest("hex");
}

export async function createPersonalizationDraft(input: {
  organizationId: string; key: string; name: string; description?: string | null; channel: string; segmentId?: string | null;
  definition: unknown; startsAt?: Date | null; endsAt?: Date | null; actorUserId?: string | null;
}) {
  if (!["website", "email", "offer", "journey"].includes(input.channel)) throw new Error("Unsupported personalization channel");
  if (!/^[a-z0-9][a-z0-9_.-]{0,99}$/.test(input.key)) throw new Error("Experience key must use lowercase letters, numbers, periods, underscores, or dashes");
  if (input.startsAt && input.endsAt && input.endsAt <= input.startsAt) throw new Error("Experience end must be after its start");
  if (input.segmentId) {
    const [segment] = await db.select({ id: customerSegments.id }).from(customerSegments).where(and(eq(customerSegments.organizationId, input.organizationId), eq(customerSegments.id, input.segmentId))).limit(1);
    if (!segment) throw new Error("Segment not found in this tenant");
  }
  const definition = validatePersonalizationDefinition(input.definition);
  const checksum = personalizationDefinitionChecksum(definition);
  return db.transaction(async (tx) => {
    const [experience] = await tx.insert(personalizationExperiences).values({
      organizationId: input.organizationId, key: input.key, name: input.name, description: input.description ?? null,
      channel: input.channel, segmentId: input.segmentId ?? null, status: "draft", definition,
      startsAt: input.startsAt ?? null, endsAt: input.endsAt ?? null, createdByUserId: input.actorUserId ?? null,
    }).returning();
    const [version] = await tx.insert(personalizationExperienceVersions).values({
      organizationId: input.organizationId, experienceId: experience.id, version: 1, definition, checksum, status: "draft", createdByUserId: input.actorUserId ?? null,
    }).returning();
    return { experience, version };
  });
}

export async function createPersonalizationVersion(input: { organizationId: string; experienceId: string; definition: unknown; actorUserId?: string | null }) {
  const definition = validatePersonalizationDefinition(input.definition);
  const checksum = personalizationDefinitionChecksum(definition);
  const [existing] = await db.select().from(personalizationExperienceVersions).where(and(
    eq(personalizationExperienceVersions.organizationId, input.organizationId),
    eq(personalizationExperienceVersions.experienceId, input.experienceId),
    eq(personalizationExperienceVersions.checksum, checksum),
  )).limit(1);
  if (existing) return existing;
  const [latest] = await db.select({ version: personalizationExperienceVersions.version }).from(personalizationExperienceVersions).where(and(
    eq(personalizationExperienceVersions.organizationId, input.organizationId), eq(personalizationExperienceVersions.experienceId, input.experienceId),
  )).orderBy(desc(personalizationExperienceVersions.version)).limit(1);
  const [created] = await db.insert(personalizationExperienceVersions).values({
    organizationId: input.organizationId, experienceId: input.experienceId, version: (latest?.version ?? 0) + 1,
    definition, checksum, status: "draft", createdByUserId: input.actorUserId ?? null,
  }).returning();
  await db.update(personalizationExperiences).set({ definition, updatedAt: new Date() }).where(and(eq(personalizationExperiences.organizationId, input.organizationId), eq(personalizationExperiences.id, input.experienceId)));
  return created;
}

export async function publishPersonalization(input: { organizationId: string; experienceId: string; actorUserId: string }) {
  return db.transaction(async (tx) => {
    const [experience] = await tx.select().from(personalizationExperiences).where(and(eq(personalizationExperiences.organizationId, input.organizationId), eq(personalizationExperiences.id, input.experienceId))).limit(1);
    if (!experience) throw new Error("Personalization experience not found");
    if (experience.segmentId) {
      const [activeSegment] = await tx.select({ id: customerSegments.id }).from(customerSegments).where(and(eq(customerSegments.organizationId, input.organizationId), eq(customerSegments.id, experience.segmentId), eq(customerSegments.status, "active"))).limit(1);
      if (!activeSegment) throw new Error("The assigned segment must be published before this experience can be published");
    }
    const definition = validatePersonalizationDefinition(experience.definition);
    const checksum = personalizationDefinitionChecksum(definition);
    let [version] = await tx.select().from(personalizationExperienceVersions).where(and(eq(personalizationExperienceVersions.organizationId, input.organizationId), eq(personalizationExperienceVersions.experienceId, input.experienceId), eq(personalizationExperienceVersions.checksum, checksum))).limit(1);
    if (!version) {
      const [latest] = await tx.select({ version: personalizationExperienceVersions.version }).from(personalizationExperienceVersions).where(and(eq(personalizationExperienceVersions.organizationId, input.organizationId), eq(personalizationExperienceVersions.experienceId, input.experienceId))).orderBy(desc(personalizationExperienceVersions.version)).limit(1);
      [version] = await tx.insert(personalizationExperienceVersions).values({ organizationId: input.organizationId, experienceId: input.experienceId, version: (latest?.version ?? 0) + 1, definition, checksum, status: "draft", createdByUserId: input.actorUserId }).returning();
    }
    if (version.status !== "published") [version] = await tx.update(personalizationExperienceVersions).set({ status: "published", publishedAt: new Date() }).where(eq(personalizationExperienceVersions.id, version.id)).returning();
    await tx.insert(personalizationActiveVersions).values({ organizationId: input.organizationId, experienceId: input.experienceId, versionId: version.id, activatedByUserId: input.actorUserId, activatedAt: new Date() }).onConflictDoUpdate({ target: personalizationActiveVersions.experienceId, set: { versionId: version.id, activatedByUserId: input.actorUserId, activatedAt: new Date() } });
    await tx.update(personalizationExperiences).set({ status: "active", version: version.version, definition, updatedAt: new Date() }).where(eq(personalizationExperiences.id, input.experienceId));
    return version;
  });
}

export async function decidePersonalization(input: { organizationId: string; experienceKey: string; contactId?: string | null; subjectKey: string }) {
  const now = new Date();
  const [row] = await db.select({ experience: personalizationExperiences, version: personalizationExperienceVersions }).from(personalizationExperiences)
    .innerJoin(personalizationActiveVersions, and(eq(personalizationActiveVersions.experienceId, personalizationExperiences.id), eq(personalizationActiveVersions.organizationId, personalizationExperiences.organizationId)))
    .innerJoin(personalizationExperienceVersions, and(eq(personalizationExperienceVersions.id, personalizationActiveVersions.versionId), eq(personalizationExperienceVersions.organizationId, personalizationExperiences.organizationId)))
    .where(and(
      eq(personalizationExperiences.organizationId, input.organizationId),
      eq(personalizationExperiences.key, input.experienceKey),
      eq(personalizationExperiences.status, "active"),
      or(isNull(personalizationExperiences.startsAt), lt(personalizationExperiences.startsAt, now)),
      or(isNull(personalizationExperiences.endsAt), gt(personalizationExperiences.endsAt, now)),
      eq(personalizationExperienceVersions.status, "published"),
    )).limit(1);
  if (!row) return { eligible: false, reason: "experience_not_active", variant: null, fallback: {} };
  if (input.contactId) {
    const [contact] = await db.select({ id: contacts.id }).from(contacts).where(and(eq(contacts.organizationId, input.organizationId), eq(contacts.id, input.contactId))).limit(1);
    if (!contact) return { eligible: false, reason: "contact_not_found", variant: null, fallback: validatePersonalizationDefinition(row.version.definition).fallback };
  }
  let eligible = true;
  let reason = "eligible";
  if (row.experience.segmentId) {
    if (!input.contactId) { eligible = false; reason = "contact_required_for_segment"; }
    else {
      const segment = await activeSegmentDefinition(input.organizationId, row.experience.segmentId);
      if (!segment) { eligible = false; reason = "segment_not_active"; }
      else if (!(await contactMatchesSegment(input.organizationId, input.contactId, segment))) { eligible = false; reason = "segment_not_matched"; }
    }
  }
  const definition: PersonalizationDefinition = validatePersonalizationDefinition(row.version.definition);
  const subjectKeyHash = personalizationSubjectHash(input.organizationId, input.subjectKey);
  if (!eligible) return { eligible: false, reason, variant: null, fallback: definition.fallback, experienceVersion: row.version.version };
  let [assignment] = await db.select().from(personalizationAssignments).where(and(
    eq(personalizationAssignments.organizationId, input.organizationId),
    eq(personalizationAssignments.experienceId, row.experience.id),
    eq(personalizationAssignments.experienceVersionId, row.version.id),
    eq(personalizationAssignments.subjectKeyHash, subjectKeyHash),
  )).limit(1);
  if (!assignment) {
    const selected = chooseExperimentVariant(`${input.organizationId}:${row.version.id}:${subjectKeyHash}`, definition.variants.map((variant) => ({ ...variant, targetIndex: 1 }))) as unknown as PersonalizationVariant & { targetIndex: number };
    await db.insert(personalizationAssignments).values({
      organizationId: input.organizationId, experienceId: row.experience.id, experienceVersionId: row.version.id,
      contactId: input.contactId ?? null, subjectKeyHash, variantId: selected.id, variantName: selected.name,
      eligible: true, eligibilityReason: reason, payload: selected.payload,
    }).onConflictDoNothing();
    [assignment] = await db.select().from(personalizationAssignments).where(and(
      eq(personalizationAssignments.organizationId, input.organizationId), eq(personalizationAssignments.experienceId, row.experience.id),
      eq(personalizationAssignments.experienceVersionId, row.version.id), eq(personalizationAssignments.subjectKeyHash, subjectKeyHash),
    )).limit(1);
  }
  if (!assignment) throw new Error("Personalization assignment could not be persisted");
  return { eligible: true, reason, variant: { id: assignment.variantId, name: assignment.variantName, payload: assignment.payload }, fallback: definition.fallback, experienceVersion: row.version.version };
}


export async function rollbackPersonalization(input: { organizationId: string; experienceId: string; actorUserId: string; targetVersion?: number }) {
  return db.transaction(async (tx) => {
    const versions = await tx.select().from(personalizationExperienceVersions).where(and(
      eq(personalizationExperienceVersions.organizationId, input.organizationId),
      eq(personalizationExperienceVersions.experienceId, input.experienceId),
      eq(personalizationExperienceVersions.status, "published"),
    )).orderBy(desc(personalizationExperienceVersions.version));
    const [active] = await tx.select({ versionId: personalizationActiveVersions.versionId }).from(personalizationActiveVersions).where(and(eq(personalizationActiveVersions.organizationId, input.organizationId), eq(personalizationActiveVersions.experienceId, input.experienceId))).limit(1);
    const activeVersion = versions.find((version) => version.id === active?.versionId);
    const target = input.targetVersion !== undefined ? versions.find((version) => version.version === input.targetVersion) : versions.find((version) => !activeVersion || version.version < activeVersion.version);
    if (!target) throw new Error("No eligible published personalization version was found");
    const definition = validatePersonalizationDefinition(target.definition);
    await tx.update(personalizationActiveVersions).set({ versionId: target.id, activatedByUserId: input.actorUserId, activatedAt: new Date() }).where(and(eq(personalizationActiveVersions.organizationId, input.organizationId), eq(personalizationActiveVersions.experienceId, input.experienceId)));
    await tx.update(personalizationExperiences).set({ status: "active", version: target.version, definition, updatedAt: new Date() }).where(and(eq(personalizationExperiences.organizationId, input.organizationId), eq(personalizationExperiences.id, input.experienceId)));
    return target;
  });
}
