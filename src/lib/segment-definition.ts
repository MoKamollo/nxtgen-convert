import { createHash } from "crypto";

export type SegmentCondition = {
  field: "status" | "score" | "source" | "email" | "phone" | "jobTitle" | "department" | "companyId" | "tags" | "createdAt" | "lastContactedAt";
  operator: "equals" | "not_equals" | "greater_than" | "greater_or_equal" | "less_than" | "less_or_equal" | "contains" | "not_contains" | "exists" | "not_exists" | "in" | "not_in";
  value?: string | number | boolean | null | Array<string | number | boolean | null>;
};
export type SegmentDefinition = { combinator: "and" | "or"; conditions: SegmentCondition[] };

const FIELDS = new Set(["status", "score", "source", "email", "phone", "jobTitle", "department", "companyId", "tags", "createdAt", "lastContactedAt"]);
const OPERATORS = new Set(["equals", "not_equals", "greater_than", "greater_or_equal", "less_than", "less_or_equal", "contains", "not_contains", "exists", "not_exists", "in", "not_in"]);

export function validateSegmentDefinition(input: unknown): SegmentDefinition {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new Error("Segment definition must be an object");
  const value = input as Record<string, unknown>;
  const combinator = String(value.combinator ?? "and");
  if (!["and", "or"].includes(combinator)) throw new Error("Segment combinator must be and or or");
  if (!Array.isArray(value.conditions)) throw new Error("Segment conditions must be an array");
  if (value.conditions.length > 50) throw new Error("A segment cannot contain more than 50 conditions");
  const conditions = value.conditions.map((raw, index) => {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw new Error(`Segment condition ${index + 1} must be an object`);
    const condition = raw as Record<string, unknown>;
    const field = String(condition.field ?? "");
    const operator = String(condition.operator ?? "");
    if (!FIELDS.has(field)) throw new Error(`Unsupported segment field at condition ${index + 1}: ${field}`);
    if (!OPERATORS.has(operator)) throw new Error(`Unsupported segment operator at condition ${index + 1}: ${operator}`);
    if (!["exists", "not_exists"].includes(operator) && !("value" in condition)) throw new Error(`Segment condition ${index + 1} requires a value`);
    if (["in", "not_in"].includes(operator) && !Array.isArray(condition.value)) throw new Error(`Segment condition ${index + 1} requires an array value`);
    if (["greater_than", "greater_or_equal", "less_than", "less_or_equal"].includes(operator) && !["score", "createdAt", "lastContactedAt"].includes(field)) throw new Error(`Operator ${operator} is not supported for ${field}`);
    return { field, operator, ...(["exists", "not_exists"].includes(operator) ? {} : { value: condition.value }) } as SegmentCondition;
  });
  return { combinator: combinator as "and" | "or", conditions };
}

export function segmentDefinitionChecksum(definition: SegmentDefinition): string {
  return createHash("sha256").update(JSON.stringify(definition)).digest("hex");
}
