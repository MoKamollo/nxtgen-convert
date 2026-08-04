import { createHash } from "crypto";

export type PersonalizationVariant = { id: string; name: string; weight: number; payload: Record<string, unknown> };
export type PersonalizationDefinition = { fallback: Record<string, unknown>; variants: PersonalizationVariant[] };

export function validatePersonalizationDefinition(input: unknown): PersonalizationDefinition {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new Error("Personalization definition must be an object");
  const value = input as Record<string, unknown>;
  if (!Array.isArray(value.variants) || value.variants.length < 1 || value.variants.length > 20) throw new Error("Personalization requires 1 to 20 variants");
  const ids = new Set<string>();
  let total = 0;
  const variants = value.variants.map((raw, index) => {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw new Error(`Variant ${index + 1} must be an object`);
    const variant = raw as Record<string, unknown>;
    const id = String(variant.id ?? "").trim();
    const name = String(variant.name ?? "").trim();
    const weight = Number(variant.weight);
    if (!/^[A-Za-z0-9_-]{1,50}$/.test(id)) throw new Error(`Variant ${index + 1} has an invalid id`);
    if (ids.has(id)) throw new Error("Variant ids must be unique");
    ids.add(id);
    if (!name || name.length > 100) throw new Error(`Variant ${index + 1} requires a name`);
    if (!Number.isFinite(weight) || weight <= 0 || weight > 100) throw new Error(`Variant ${index + 1} has an invalid weight`);
    total += weight;
    const payload = variant.payload && typeof variant.payload === "object" && !Array.isArray(variant.payload) ? variant.payload as Record<string, unknown> : {};
    if (JSON.stringify(payload).length > 50_000) throw new Error(`Variant ${index + 1} payload is too large`);
    return { id, name, weight, payload };
  });
  if (Math.abs(total - 100) > 0.001) throw new Error("Personalization variant weights must total 100");
  const fallback = value.fallback && typeof value.fallback === "object" && !Array.isArray(value.fallback) ? value.fallback as Record<string, unknown> : {};
  return { fallback, variants };
}

export function personalizationDefinitionChecksum(definition: PersonalizationDefinition): string {
  return createHash("sha256").update(JSON.stringify(definition)).digest("hex");
}
