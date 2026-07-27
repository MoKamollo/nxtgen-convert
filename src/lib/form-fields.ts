export const FORM_FIELD_TYPES = new Set([
  "text",
  "email",
  "phone",
  "textarea",
  "select",
  "checkbox",
]);

export type MarketingFormField = {
  id: string;
  label: string;
  type: "text" | "email" | "phone" | "textarea" | "select" | "checkbox";
  required: boolean;
  options?: string[];
};

export function normalizeFormFields(value: unknown): MarketingFormField[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  const fields: MarketingFormField[] = [];
  for (const raw of value.slice(0, 30)) {
    if (!raw || typeof raw !== "object") continue;
    const record = raw as Record<string, unknown>;
    const label = String(record.label ?? "").trim().slice(0, 100);
    const type = String(record.type ?? "text").toLowerCase();
    const rawId = String(record.id ?? label)
      .trim()
      .replace(/[^A-Za-z0-9_-]/g, "_")
      .slice(0, 80);
    let id = rawId || `field_${fields.length + 1}`;
    while (seen.has(id)) id = `${id}_${fields.length + 1}`;
    if (!label || !FORM_FIELD_TYPES.has(type)) continue;
    seen.add(id);
    const options = Array.isArray(record.options)
      ? [...new Set(record.options.map((option) => String(option).trim()).filter(Boolean))].slice(0, 50)
      : [];
    fields.push({
      id,
      label,
      type: type as MarketingFormField["type"],
      required: Boolean(record.required),
      ...(type === "select" ? { options } : {}),
    });
  }
  return fields;
}
