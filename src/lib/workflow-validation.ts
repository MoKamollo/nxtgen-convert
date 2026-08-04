export type WorkflowValue = string | number | boolean | null;

export type WorkflowCondition = {
  source: "contact" | "deal" | "context" | "enrollment";
  field: string;
  operator:
    | "equals"
    | "not_equals"
    | "greater_than"
    | "greater_or_equal"
    | "less_than"
    | "less_or_equal"
    | "contains"
    | "not_contains"
    | "exists"
    | "not_exists"
    | "in"
    | "not_in";
  value?: WorkflowValue | WorkflowValue[];
};

export type WorkflowExperimentVariant = {
  id: string;
  name: string;
  weight: number;
  targetIndex: number;
};

export type ValidatedWorkflowStep = {
  type: "create_activity" | "send_email" | "update_contact" | "wait" | "condition" | "experiment" | "goal" | "exit";
  config: Record<string, unknown>;
};

export const SUPPORTED_TRIGGER_EVENTS = ["contact.created", "deal.stage_changed", "manual"] as const;
export const SUPPORTED_WORKFLOW_STEPS = ["create_activity", "send_email", "update_contact", "wait", "condition", "experiment", "goal", "exit"] as const;

const SUPPORTED_STEPS = new Set<string>(SUPPORTED_WORKFLOW_STEPS);
const CONDITION_OPERATORS = new Set([
  "equals", "not_equals", "greater_than", "greater_or_equal", "less_than", "less_or_equal",
  "contains", "not_contains", "exists", "not_exists", "in", "not_in",
]);

const CONTACT_FIELDS = new Set(["status", "score", "source", "email", "phone", "mobile", "jobTitle", "department", "companyId", "tags", "archivedAt"]);
const DEAL_FIELDS = new Set(["stage", "value", "probability", "currency", "contactId", "companyId", "expectedCloseDate", "wonAt", "lostAt", "tags"]);
const ENROLLMENT_FIELDS = new Set(["event", "attemptCount", "createdAt"]);

function plainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function finiteInteger(value: unknown, label: string): number {
  const number = Number(value);
  if (!Number.isInteger(number)) throw new Error(`${label} must be an integer`);
  return number;
}

function validateTarget(target: unknown, currentIndex: number, stepCount: number, label: string): number {
  const index = finiteInteger(target, label);
  if (index <= currentIndex) throw new Error(`${label} must point to a later step`);
  if (index > stepCount) throw new Error(`${label} is outside the workflow`);
  return index;
}

function validateCondition(input: unknown, label: string): WorkflowCondition {
  if (!plainObject(input)) throw new Error(`${label} must be an object`);
  const source = String(input.source ?? "");
  if (!["contact", "deal", "context", "enrollment"].includes(source)) throw new Error(`${label} has an unsupported source`);
  const field = String(input.field ?? "").trim();
  if (!field || field.length > 100) throw new Error(`${label} requires a valid field`);
  if (source === "contact" && !CONTACT_FIELDS.has(field)) throw new Error(`${label} uses an unsupported contact field: ${field}`);
  if (source === "deal" && !DEAL_FIELDS.has(field)) throw new Error(`${label} uses an unsupported deal field: ${field}`);
  if (source === "enrollment" && !ENROLLMENT_FIELDS.has(field)) throw new Error(`${label} uses an unsupported enrollment field: ${field}`);
  if (source === "context" && !/^[A-Za-z0-9_.-]+$/.test(field)) throw new Error(`${label} context field is invalid`);
  const operator = String(input.operator ?? "");
  if (!CONDITION_OPERATORS.has(operator)) throw new Error(`${label} has an unsupported operator`);
  if (!["exists", "not_exists"].includes(operator) && !("value" in input)) throw new Error(`${label} requires a comparison value`);
  if (["in", "not_in"].includes(operator) && !Array.isArray(input.value)) throw new Error(`${label} requires an array value`);
  if (Array.isArray(input.value) && input.value.length > 100) throw new Error(`${label} contains too many comparison values`);
  return { source, field, operator, ...(operator === "exists" || operator === "not_exists" ? {} : { value: input.value as WorkflowValue | WorkflowValue[] }) } as WorkflowCondition;
}

function validateStep(raw: unknown, index: number, stepCount: number): ValidatedWorkflowStep {
  if (!plainObject(raw)) throw new Error(`Workflow step ${index + 1} must be an object`);
  const type = String(raw.type ?? "");
  if (!SUPPORTED_STEPS.has(type)) throw new Error(`Unsupported step type at position ${index + 1}: ${type}`);
  const sourceConfig = plainObject(raw.config) ? raw.config : {};
  const config: Record<string, unknown> = { ...sourceConfig };

  if (type === "wait") {
    const amount = Number(config.amount ?? 1);
    if (!Number.isFinite(amount) || amount < 1 || amount > 365) throw new Error(`Invalid wait amount at position ${index + 1}`);
    const unit = String(config.unit ?? "hours");
    if (!["minutes", "hours", "days"].includes(unit)) throw new Error(`Invalid wait unit at position ${index + 1}`);
    config.amount = amount;
    config.unit = unit;
  }

  if (type === "send_email") {
    const purpose = String(config.purpose ?? "marketing");
    if (!["marketing", "transactional", "customer_success"].includes(purpose)) throw new Error(`Invalid email purpose at position ${index + 1}`);
    const subject = String(config.subject ?? "").trim();
    if (!subject) throw new Error(`Email subject is required at position ${index + 1}`);
    config.purpose = purpose;
    config.subject = subject.slice(0, 998);
    config.body = String(config.body ?? "").slice(0, 20_000);
  }

  if (type === "create_activity") {
    const activityType = String(config.type ?? "note");
    if (!["email", "call", "meeting", "note", "task"].includes(activityType)) throw new Error(`Invalid activity type at position ${index + 1}`);
    const subject = String(config.subject ?? "").trim();
    if (!subject) throw new Error(`Activity subject is required at position ${index + 1}`);
    config.type = activityType;
    config.subject = subject.slice(0, 300);
    config.body = String(config.body ?? "").slice(0, 20_000);
  }

  if (type === "update_contact") {
    const status = config.status === undefined ? undefined : String(config.status);
    if (status !== undefined && !["lead", "prospect", "customer", "churned", "vip"].includes(status)) throw new Error(`Invalid contact status at position ${index + 1}`);
    if (config.score !== undefined) {
      const score = Number(config.score);
      if (!Number.isFinite(score) || score < 0 || score > 100) throw new Error(`Invalid contact score at position ${index + 1}`);
      config.score = score;
    }
    if (status === undefined && config.score === undefined) throw new Error(`Contact update requires at least one field at position ${index + 1}`);
  }

  if (type === "condition") {
    config.condition = validateCondition(config.condition, `Condition at position ${index + 1}`);
    config.onTrueIndex = validateTarget(config.onTrueIndex ?? index + 1, index, stepCount, `True branch at position ${index + 1}`);
    config.onFalseIndex = validateTarget(config.onFalseIndex ?? index + 1, index, stepCount, `False branch at position ${index + 1}`);
  }

  if (type === "experiment") {
    if (!Array.isArray(config.variants) || config.variants.length < 2 || config.variants.length > 10) throw new Error(`Experiment at position ${index + 1} requires 2 to 10 variants`);
    const ids = new Set<string>();
    let totalWeight = 0;
    config.variants = config.variants.map((variant, variantIndex) => {
      if (!plainObject(variant)) throw new Error(`Experiment variant ${variantIndex + 1} at position ${index + 1} must be an object`);
      const id = String(variant.id ?? "").trim();
      const name = String(variant.name ?? "").trim();
      if (!/^[A-Za-z0-9_-]{1,50}$/.test(id)) throw new Error(`Experiment variant ${variantIndex + 1} has an invalid id`);
      if (ids.has(id)) throw new Error(`Experiment variant ids must be unique at position ${index + 1}`);
      ids.add(id);
      if (!name || name.length > 100) throw new Error(`Experiment variant ${variantIndex + 1} requires a name`);
      const weight = Number(variant.weight);
      if (!Number.isFinite(weight) || weight <= 0 || weight > 100) throw new Error(`Experiment variant ${variantIndex + 1} has an invalid weight`);
      totalWeight += weight;
      const targetIndex = validateTarget(variant.targetIndex, index, stepCount, `Experiment variant ${variantIndex + 1} target`);
      return { id, name, weight, targetIndex } satisfies WorkflowExperimentVariant;
    });
    if (Math.abs(totalWeight - 100) > 0.001) throw new Error(`Experiment weights at position ${index + 1} must total 100`);
    config.experimentKey = String(config.experimentKey ?? `step-${index}`).trim().slice(0, 100);
    if (!config.experimentKey) throw new Error(`Experiment key is required at position ${index + 1}`);
  }

  if (type === "goal") {
    const key = String(config.key ?? "").trim();
    const name = String(config.name ?? "").trim();
    if (!/^[A-Za-z0-9_.-]{1,100}$/.test(key)) throw new Error(`Goal key is invalid at position ${index + 1}`);
    if (!name || name.length > 200) throw new Error(`Goal name is required at position ${index + 1}`);
    if (config.condition !== undefined) config.condition = validateCondition(config.condition, `Goal condition at position ${index + 1}`);
    config.key = key;
    config.name = name;
    config.exitOnMatch = Boolean(config.exitOnMatch);
  }

  if (type === "exit") {
    const exitType = String(config.exitType ?? "neutral");
    if (!["success", "neutral", "disqualified"].includes(exitType)) throw new Error(`Invalid exit type at position ${index + 1}`);
    const reason = String(config.reason ?? "Journey exit").trim();
    if (!reason || reason.length > 500) throw new Error(`Exit reason is invalid at position ${index + 1}`);
    config.exitType = exitType;
    config.reason = reason;
  }

  return { type: type as ValidatedWorkflowStep["type"], config };
}

export function validateWorkflowDefinition(input: unknown): { trigger: { event: string }; steps: ValidatedWorkflowStep[] } {
  if (!plainObject(input)) throw new Error("Workflow definition must be an object");
  const trigger = plainObject(input.trigger) ? input.trigger : {};
  const event = String(trigger.event ?? "manual");
  if (!SUPPORTED_TRIGGER_EVENTS.includes(event as typeof SUPPORTED_TRIGGER_EVENTS[number])) throw new Error(`Unsupported trigger event: ${event}`);
  if (!Array.isArray(input.steps)) throw new Error("Workflow steps must be an array");
  const rawSteps = input.steps;
  if (rawSteps.length > 100) throw new Error("A workflow cannot contain more than 100 steps");
  const steps = rawSteps.map((raw, index) => validateStep(raw, index, rawSteps.length));
  return { trigger: { event }, steps };
}
