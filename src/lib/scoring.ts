export type ScoringModel = {
  emailPresent: number;
  phonePresent: number;
  jobTitlePresent: number;
  statusBase: Record<string, number>;
  sourceBonus: Record<string, number>;
  customFieldPoint: number;
};

export const DEFAULT_SCORING_MODEL: ScoringModel = {
  emailPresent: 10,
  phonePresent: 5,
  jobTitlePresent: 5,
  statusBase: { vip: 90, customer: 70, prospect: 45, lead: 25, churned: 10 },
  sourceBonus: {
    referral: 15,
    organic: 10,
    event: 8,
    paid_ads: 5,
    partner: 12,
    website: 8,
    linkedin: 7,
  },
  customFieldPoint: 2,
};

function boundedNumber(value: unknown, fallback: number, minimum = 0, maximum = 100) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.min(maximum, Math.max(minimum, number));
}

function normalizeWeights(
  value: unknown,
  fallback: Record<string, number>,
  maximumEntries = 50,
) {
  const source = value && typeof value === "object" ? value as Record<string, unknown> : {};
  const result: Record<string, number> = { ...fallback };
  for (const [rawKey, rawValue] of Object.entries(source).slice(0, maximumEntries)) {
    const key = rawKey.toLowerCase().trim().replace(/[^a-z0-9_-]/g, "_").slice(0, 50);
    if (!key) continue;
    result[key] = boundedNumber(rawValue, result[key] ?? 0);
  }
  return result;
}

export function normalizeScoringModel(value: unknown): ScoringModel {
  const input = value && typeof value === "object" ? value as Partial<ScoringModel> : {};
  return {
    emailPresent: boundedNumber(input.emailPresent, DEFAULT_SCORING_MODEL.emailPresent),
    phonePresent: boundedNumber(input.phonePresent, DEFAULT_SCORING_MODEL.phonePresent),
    jobTitlePresent: boundedNumber(input.jobTitlePresent, DEFAULT_SCORING_MODEL.jobTitlePresent),
    customFieldPoint: boundedNumber(input.customFieldPoint, DEFAULT_SCORING_MODEL.customFieldPoint, 0, 25),
    statusBase: normalizeWeights(input.statusBase, DEFAULT_SCORING_MODEL.statusBase, 10),
    sourceBonus: normalizeWeights(input.sourceBonus, DEFAULT_SCORING_MODEL.sourceBonus),
  };
}

export function scoreContact(
  contact: {
    email: string | null;
    phone: string | null;
    mobile?: string | null;
    jobTitle: string | null;
    status: string | null;
    source: string | null;
    customFields: unknown;
  },
  rawModel: ScoringModel,
) {
  const model = normalizeScoringModel(rawModel);
  const factors: Array<{ label: string; points: number }> = [];
  const add = (label: string, points: number) => {
    if (points !== 0) factors.push({ label, points });
  };
  add(`Status: ${contact.status ?? "lead"}`, model.statusBase[contact.status ?? "lead"] ?? 0);
  if (contact.email) add("Email present", model.emailPresent);
  if (contact.phone || contact.mobile) add("Phone present", model.phonePresent);
  if (contact.jobTitle) add("Job title present", model.jobTitlePresent);
  const source = (contact.source ?? "").toLowerCase().trim().replace(/\s+/g, "_");
  if (source && model.sourceBonus[source]) {
    add(`Source: ${contact.source}`, model.sourceBonus[source]);
  }
  const customFields =
    contact.customFields && typeof contact.customFields === "object"
      ? Object.values(contact.customFields as Record<string, unknown>)
      : [];
  const completed = customFields.filter(
    (fieldValue) => fieldValue !== null && fieldValue !== undefined && fieldValue !== "",
  ).length;
  if (completed > 0) {
    add(`${completed} custom fields completed`, completed * model.customFieldPoint);
  }
  const rawScore = factors.reduce((sum, factor) => sum + factor.points, 0);
  return { score: Math.max(0, Math.min(100, Math.round(rawScore))), rawScore, factors };
}
