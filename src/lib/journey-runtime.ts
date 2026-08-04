import { createHash } from "crypto";
import type { WorkflowCondition, WorkflowExperimentVariant, WorkflowValue } from "./workflow-validation.ts";

export type JourneyContext = {
  contact?: Record<string, unknown> | null;
  deal?: Record<string, unknown> | null;
  context?: Record<string, unknown> | null;
  enrollment?: Record<string, unknown> | null;
};

function nestedValue(source: Record<string, unknown> | null | undefined, path: string): unknown {
  if (!source) return undefined;
  return path.split(".").reduce<unknown>((value, part) => {
    if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
    return (value as Record<string, unknown>)[part];
  }, source);
}

function comparable(value: unknown): string | number | boolean | null | undefined {
  if (value === null || value === undefined || typeof value === "string" || typeof value === "number" || typeof value === "boolean") return value;
  if (value instanceof Date) return value.getTime();
  return String(value);
}

function equal(left: unknown, right: unknown): boolean {
  const a = comparable(left);
  const b = comparable(right);
  if (typeof a === "number" || typeof b === "number") {
    const an = Number(a);
    const bn = Number(b);
    return Number.isFinite(an) && Number.isFinite(bn) && an === bn;
  }
  return String(a ?? "").toLowerCase() === String(b ?? "").toLowerCase();
}

function contains(left: unknown, right: unknown): boolean {
  if (Array.isArray(left)) return left.some((entry) => equal(entry, right));
  return String(left ?? "").toLowerCase().includes(String(right ?? "").toLowerCase());
}

export function evaluateWorkflowCondition(condition: WorkflowCondition, values: JourneyContext): boolean {
  const source = values[condition.source] as Record<string, unknown> | null | undefined;
  const actual = nestedValue(source, condition.field);
  const expected = condition.value as WorkflowValue | WorkflowValue[] | undefined;
  switch (condition.operator) {
    case "exists": return actual !== undefined && actual !== null && actual !== "";
    case "not_exists": return actual === undefined || actual === null || actual === "";
    case "equals": return equal(actual, expected);
    case "not_equals": return !equal(actual, expected);
    case "contains": return contains(actual, expected);
    case "not_contains": return !contains(actual, expected);
    case "in": return Array.isArray(expected) && expected.some((entry) => equal(actual, entry));
    case "not_in": return Array.isArray(expected) && !expected.some((entry) => equal(actual, entry));
    case "greater_than": return Number(actual) > Number(expected);
    case "greater_or_equal": return Number(actual) >= Number(expected);
    case "less_than": return Number(actual) < Number(expected);
    case "less_or_equal": return Number(actual) <= Number(expected);
    default: return false;
  }
}

export function chooseExperimentVariant(seed: string, variants: WorkflowExperimentVariant[]): WorkflowExperimentVariant {
  const digest = createHash("sha256").update(seed).digest();
  const bucket = digest.readUInt32BE(0) / 0x1_0000_0000 * 100;
  let cumulative = 0;
  for (const variant of variants) {
    cumulative += variant.weight;
    if (bucket < cumulative) return variant;
  }
  return variants[variants.length - 1];
}
