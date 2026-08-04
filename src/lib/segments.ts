import { and, desc, eq, sql, type SQL } from "drizzle-orm";
import { db } from "@/db";
import { contacts, customerSegmentActiveVersions, customerSegments, customerSegmentVersions } from "@/db/schema";
import { segmentDefinitionChecksum, validateSegmentDefinition, type SegmentCondition, type SegmentDefinition } from "@/lib/segment-definition";

function conditionSql(condition: SegmentCondition): SQL {
  const fields: Record<SegmentCondition["field"], SQL> = {
    status: sql`${contacts.status}`,
    score: sql`${contacts.score}`,
    source: sql`${contacts.source}`,
    email: sql`${contacts.email}`,
    phone: sql`${contacts.phone}`,
    jobTitle: sql`${contacts.jobTitle}`,
    department: sql`${contacts.department}`,
    companyId: sql`${contacts.companyId}`,
    tags: sql`${contacts.tags}`,
    createdAt: sql`${contacts.createdAt}`,
    lastContactedAt: sql`${contacts.lastContactedAt}`,
  };
  const field = fields[condition.field];
  const value = condition.value;
  if (condition.operator === "exists") return sql`${field} IS NOT NULL`;
  if (condition.operator === "not_exists") return sql`${field} IS NULL`;
  if (condition.operator === "contains") {
    if (condition.field === "tags") return sql`${contacts.tags} @> ARRAY[${String(value ?? "")}]::text[]`;
    return sql`lower(COALESCE(${field}::text,'')) LIKE ${`%${String(value ?? "").toLowerCase()}%`}`;
  }
  if (condition.operator === "not_contains") {
    if (condition.field === "tags") return sql`NOT (${contacts.tags} @> ARRAY[${String(value ?? "")}]::text[])`;
    return sql`lower(COALESCE(${field}::text,'')) NOT LIKE ${`%${String(value ?? "").toLowerCase()}%`}`;
  }
  if (condition.operator === "in" || condition.operator === "not_in") {
    const values = Array.isArray(value) ? value : [];
    if (values.length === 0) return condition.operator === "in" ? sql`FALSE` : sql`TRUE`;
    const list = sql.join(values.map((item) => sql`${item}`), sql`, `);
    return condition.operator === "in" ? sql`${field} IN (${list})` : sql`${field} NOT IN (${list})`;
  }
  const normalized = ["createdAt", "lastContactedAt"].includes(condition.field) && value ? new Date(String(value)) : value;
  if (condition.operator === "equals") return sql`${field} = ${normalized}`;
  if (condition.operator === "not_equals") return sql`${field} IS DISTINCT FROM ${normalized}`;
  if (condition.operator === "greater_than") return sql`${field} > ${normalized}`;
  if (condition.operator === "greater_or_equal") return sql`${field} >= ${normalized}`;
  if (condition.operator === "less_than") return sql`${field} < ${normalized}`;
  if (condition.operator === "less_or_equal") return sql`${field} <= ${normalized}`;
  return sql`FALSE`;
}

export function compileSegmentWhere(organizationId: string, definitionInput: unknown): SQL {
  const definition = validateSegmentDefinition(definitionInput);
  const tenant = sql`${contacts.organizationId} = ${organizationId}`;
  const active = sql`${contacts.archivedAt} IS NULL`;
  if (definition.conditions.length === 0) return sql`${tenant} AND ${active}`;
  const conditions = definition.conditions.map(conditionSql);
  const joined = sql.join(conditions, definition.combinator === "and" ? sql` AND ` : sql` OR `);
  return sql`${tenant} AND ${active} AND (${joined})`;
}

export async function countSegmentMembers(organizationId: string, definition: SegmentDefinition): Promise<number> {
  const [row] = await db.select({ total: sql<number>`count(*)` }).from(contacts).where(compileSegmentWhere(organizationId, definition));
  return Number(row?.total ?? 0);
}

export async function contactMatchesSegment(organizationId: string, contactId: string, definition: SegmentDefinition): Promise<boolean> {
  const [row] = await db.select({ id: contacts.id }).from(contacts).where(sql`${compileSegmentWhere(organizationId, definition)} AND ${contacts.id} = ${contactId}`).limit(1);
  return Boolean(row);
}

export async function createSegmentDraft(input: { organizationId: string; name: string; description?: string | null; definition: unknown; actorUserId?: string | null }) {
  const definition = validateSegmentDefinition(input.definition);
  const checksum = segmentDefinitionChecksum(definition);
  return db.transaction(async (tx) => {
    const [segment] = await tx.insert(customerSegments).values({
      organizationId: input.organizationId,
      name: input.name,
      description: input.description ?? null,
      definition,
      status: "draft",
      createdByUserId: input.actorUserId ?? null,
    }).returning();
    const [version] = await tx.insert(customerSegmentVersions).values({
      organizationId: input.organizationId,
      segmentId: segment.id,
      version: 1,
      definition,
      checksum,
      status: "draft",
      createdByUserId: input.actorUserId ?? null,
    }).returning();
    return { segment, version };
  });
}

export async function createSegmentVersion(input: { organizationId: string; segmentId: string; definition: unknown; actorUserId?: string | null }) {
  const definition = validateSegmentDefinition(input.definition);
  const checksum = segmentDefinitionChecksum(definition);
  const [existing] = await db.select().from(customerSegmentVersions).where(and(
    eq(customerSegmentVersions.organizationId, input.organizationId),
    eq(customerSegmentVersions.segmentId, input.segmentId),
    eq(customerSegmentVersions.checksum, checksum),
  )).limit(1);
  if (existing) return existing;
  const [latest] = await db.select({ version: customerSegmentVersions.version }).from(customerSegmentVersions).where(and(
    eq(customerSegmentVersions.organizationId, input.organizationId), eq(customerSegmentVersions.segmentId, input.segmentId),
  )).orderBy(desc(customerSegmentVersions.version)).limit(1);
  const [created] = await db.insert(customerSegmentVersions).values({
    organizationId: input.organizationId, segmentId: input.segmentId, version: (latest?.version ?? 0) + 1,
    definition, checksum, status: "draft", createdByUserId: input.actorUserId ?? null,
  }).returning();
  await db.update(customerSegments).set({ definition, updatedAt: new Date() }).where(and(eq(customerSegments.organizationId, input.organizationId), eq(customerSegments.id, input.segmentId)));
  return created;
}

export async function publishSegment(input: { organizationId: string; segmentId: string; actorUserId: string }) {
  return db.transaction(async (tx) => {
    const [segment] = await tx.select().from(customerSegments).where(and(eq(customerSegments.organizationId, input.organizationId), eq(customerSegments.id, input.segmentId))).limit(1);
    if (!segment) throw new Error("Segment not found");
    const definition = validateSegmentDefinition(segment.definition);
    const checksum = segmentDefinitionChecksum(definition);
    let [version] = await tx.select().from(customerSegmentVersions).where(and(eq(customerSegmentVersions.organizationId, input.organizationId), eq(customerSegmentVersions.segmentId, input.segmentId), eq(customerSegmentVersions.checksum, checksum))).limit(1);
    if (!version) {
      const [latest] = await tx.select({ version: customerSegmentVersions.version }).from(customerSegmentVersions).where(and(eq(customerSegmentVersions.organizationId, input.organizationId), eq(customerSegmentVersions.segmentId, input.segmentId))).orderBy(desc(customerSegmentVersions.version)).limit(1);
      [version] = await tx.insert(customerSegmentVersions).values({ organizationId: input.organizationId, segmentId: input.segmentId, version: (latest?.version ?? 0) + 1, definition, checksum, status: "draft", createdByUserId: input.actorUserId }).returning();
    }
    if (version.status !== "published") [version] = await tx.update(customerSegmentVersions).set({ status: "published", publishedAt: new Date() }).where(eq(customerSegmentVersions.id, version.id)).returning();
    await tx.insert(customerSegmentActiveVersions).values({ organizationId: input.organizationId, segmentId: input.segmentId, versionId: version.id, activatedByUserId: input.actorUserId, activatedAt: new Date() }).onConflictDoUpdate({ target: customerSegmentActiveVersions.segmentId, set: { versionId: version.id, activatedByUserId: input.actorUserId, activatedAt: new Date() } });
    await tx.update(customerSegments).set({ status: "active", version: version.version, definition, updatedAt: new Date() }).where(eq(customerSegments.id, input.segmentId));
    return version;
  });
}

export async function activeSegmentDefinition(organizationId: string, segmentId: string): Promise<SegmentDefinition | null> {
  const [row] = await db.select({ definition: customerSegmentVersions.definition }).from(customerSegmentActiveVersions)
    .innerJoin(customerSegmentVersions, eq(customerSegmentVersions.id, customerSegmentActiveVersions.versionId))
    .where(and(eq(customerSegmentActiveVersions.organizationId, organizationId), eq(customerSegmentActiveVersions.segmentId, segmentId))).limit(1);
  return row ? validateSegmentDefinition(row.definition) : null;
}


export async function rollbackSegment(input: { organizationId: string; segmentId: string; actorUserId: string; targetVersion?: number }) {
  return db.transaction(async (tx) => {
    const versions = await tx.select().from(customerSegmentVersions).where(and(
      eq(customerSegmentVersions.organizationId, input.organizationId),
      eq(customerSegmentVersions.segmentId, input.segmentId),
      eq(customerSegmentVersions.status, "published"),
    )).orderBy(desc(customerSegmentVersions.version));
    const [active] = await tx.select({ versionId: customerSegmentActiveVersions.versionId }).from(customerSegmentActiveVersions).where(and(eq(customerSegmentActiveVersions.organizationId, input.organizationId), eq(customerSegmentActiveVersions.segmentId, input.segmentId))).limit(1);
    const activeVersion = versions.find((version) => version.id === active?.versionId);
    const target = input.targetVersion !== undefined ? versions.find((version) => version.version === input.targetVersion) : versions.find((version) => !activeVersion || version.version < activeVersion.version);
    if (!target) throw new Error("No eligible published segment version was found");
    const definition = validateSegmentDefinition(target.definition);
    await tx.update(customerSegmentActiveVersions).set({ versionId: target.id, activatedByUserId: input.actorUserId, activatedAt: new Date() }).where(and(eq(customerSegmentActiveVersions.organizationId, input.organizationId), eq(customerSegmentActiveVersions.segmentId, input.segmentId)));
    await tx.update(customerSegments).set({ status: "active", version: target.version, definition, updatedAt: new Date() }).where(and(eq(customerSegments.organizationId, input.organizationId), eq(customerSegments.id, input.segmentId)));
    return target;
  });
}
