import { createHash } from "crypto";

export type SuccessPlaybookMilestone = {
  title: string;
  description?: string | null;
  dueDays?: number | null;
  ownerRole?: "owner" | "admin" | "manager" | "member" | null;
};

export type SuccessPlaybookDefinition = {
  objectives: string[];
  successCriteria: string[];
  milestones: SuccessPlaybookMilestone[];
};

function cleanString(value: unknown, maximum: number): string {
  return String(value ?? "").trim().slice(0, maximum);
}

export function validateSuccessPlaybookDefinition(input: unknown): SuccessPlaybookDefinition {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new Error("Playbook definition must be an object");
  const source = input as Record<string, unknown>;
  const objectives = Array.isArray(source.objectives)
    ? source.objectives.map((value) => cleanString(value, 500)).filter(Boolean).slice(0, 50)
    : [];
  const successCriteria = Array.isArray(source.successCriteria)
    ? source.successCriteria.map((value) => cleanString(value, 500)).filter(Boolean).slice(0, 50)
    : [];
  if (!Array.isArray(source.milestones) || source.milestones.length === 0) throw new Error("At least one milestone is required");
  if (source.milestones.length > 100) throw new Error("A playbook may contain at most 100 milestones");

  const milestones = source.milestones.map((value, index) => {
    if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`Milestone ${index + 1} must be an object`);
    const raw = value as Record<string, unknown>;
    const title = cleanString(raw.title, 200);
    if (!title) throw new Error(`Milestone ${index + 1} requires a title`);
    const description = cleanString(raw.description, 2_000) || null;
    const dueDays = raw.dueDays === undefined || raw.dueDays === null || raw.dueDays === ""
      ? null
      : Number(raw.dueDays);
    if (dueDays !== null && (!Number.isInteger(dueDays) || dueDays < 0 || dueDays > 3_650)) {
      throw new Error(`Milestone ${index + 1} dueDays must be a whole number from 0 to 3650`);
    }
    const ownerRole = raw.ownerRole === undefined || raw.ownerRole === null || raw.ownerRole === ""
      ? null
      : String(raw.ownerRole);
    if (ownerRole !== null && !["owner", "admin", "manager", "member"].includes(ownerRole)) {
      throw new Error(`Milestone ${index + 1} ownerRole is invalid`);
    }
    return { title, description, dueDays, ownerRole: ownerRole as SuccessPlaybookMilestone["ownerRole"] };
  });

  return { objectives, successCriteria, milestones };
}

function stable(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b)).map(([key, child]) => [key, stable(child)]));
  }
  return value;
}

export function successPlaybookChecksum(definition: SuccessPlaybookDefinition): string {
  return createHash("sha256").update(JSON.stringify(stable(definition))).digest("hex");
}
