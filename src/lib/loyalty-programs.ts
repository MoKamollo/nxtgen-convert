import { createHash } from "crypto";

export type LoyaltyTierDefinition = { name: string; minimumLifetimePoints: number; benefits: string[] };
export type LoyaltyEarnRule = { eventType: string; points: number; description?: string | null };
export type LoyaltyProgramDefinition = {
  currencyName: string;
  expirationDays: number | null;
  maxPointsPerTransaction: number;
  dailyEarnLimit: number;
  fraudReviewThreshold: number;
  referralReward: number;
  earnRules: LoyaltyEarnRule[];
  tiers: LoyaltyTierDefinition[];
};

function stringValue(value: unknown, maximum: number) { return String(value ?? "").trim().slice(0, maximum); }
function integerValue(value: unknown, label: string, minimum: number, maximum: number): number {
  const number = Number(value);
  if (!Number.isInteger(number) || number < minimum || number > maximum) throw new Error(`${label} must be a whole number from ${minimum} to ${maximum}`);
  return number;
}
function stable(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b)).map(([key, child]) => [key, stable(child)]));
  return value;
}

export function validateLoyaltyProgramDefinition(input: unknown): LoyaltyProgramDefinition {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new Error("Loyalty program definition must be an object");
  const source = input as Record<string, unknown>;
  const currencyName = stringValue(source.currencyName ?? "Points", 40);
  if (!currencyName) throw new Error("Point currency name is required");
  const expirationDays = source.expirationDays === null || source.expirationDays === undefined || source.expirationDays === ""
    ? null : integerValue(source.expirationDays, "expirationDays", 1, 3_650);
  const maxPointsPerTransaction = integerValue(source.maxPointsPerTransaction ?? 10_000, "maxPointsPerTransaction", 1, 10_000_000);
  const dailyEarnLimit = integerValue(source.dailyEarnLimit ?? 25_000, "dailyEarnLimit", 1, 100_000_000);
  const fraudReviewThreshold = integerValue(source.fraudReviewThreshold ?? 5_000, "fraudReviewThreshold", 1, maxPointsPerTransaction);
  const referralReward = integerValue(source.referralReward ?? 0, "referralReward", 0, maxPointsPerTransaction);

  const earnRules = Array.isArray(source.earnRules) ? source.earnRules.map((value, index) => {
    if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`Earn rule ${index + 1} must be an object`);
    const item = value as Record<string, unknown>;
    const eventType = stringValue(item.eventType, 120).toLowerCase().replace(/[^a-z0-9._:-]/g, "_");
    if (!eventType) throw new Error(`Earn rule ${index + 1} requires eventType`);
    return { eventType, points: integerValue(item.points, `Earn rule ${index + 1} points`, 1, maxPointsPerTransaction), description: stringValue(item.description, 500) || null };
  }).slice(0, 100) : [];
  if (new Set(earnRules.map((rule) => rule.eventType)).size !== earnRules.length) throw new Error("Earn rule event types must be unique");

  const tiers = Array.isArray(source.tiers) ? source.tiers.map((value, index) => {
    if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`Tier ${index + 1} must be an object`);
    const item = value as Record<string, unknown>;
    const name = stringValue(item.name, 80);
    if (!name) throw new Error(`Tier ${index + 1} requires a name`);
    const benefits = Array.isArray(item.benefits) ? item.benefits.map((benefit) => stringValue(benefit, 300)).filter(Boolean).slice(0, 50) : [];
    return { name, minimumLifetimePoints: integerValue(item.minimumLifetimePoints ?? 0, `Tier ${index + 1} minimumLifetimePoints`, 0, 1_000_000_000), benefits };
  }).sort((a, b) => a.minimumLifetimePoints - b.minimumLifetimePoints) : [];
  if (tiers.length === 0) tiers.push({ name: "Member", minimumLifetimePoints: 0, benefits: [] });
  if (tiers[0].minimumLifetimePoints !== 0) throw new Error("The first tier must begin at zero lifetime points");
  if (new Set(tiers.map((tier) => tier.name.toLowerCase())).size !== tiers.length) throw new Error("Tier names must be unique");
  if (new Set(tiers.map((tier) => tier.minimumLifetimePoints)).size !== tiers.length) throw new Error("Tier thresholds must be unique");

  return { currencyName, expirationDays, maxPointsPerTransaction, dailyEarnLimit, fraudReviewThreshold, referralReward, earnRules, tiers };
}

export function loyaltyProgramChecksum(definition: LoyaltyProgramDefinition): string {
  return createHash("sha256").update(JSON.stringify(stable(definition))).digest("hex");
}
