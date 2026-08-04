export function isPrivateOrReservedAddress(address: string): boolean {
  const lower = address.toLowerCase();
  if (["::", "::1", "0.0.0.0", "255.255.255.255"].includes(lower)) return true;
  if (lower.startsWith("::ffff:")) return isPrivateOrReservedAddress(lower.slice(7));
  if (
    lower.startsWith("fc")
    || lower.startsWith("fd")
    || lower.startsWith("fe80:")
    || lower.startsWith("ff")
    || lower.startsWith("2001:db8:")
  ) return true;

  const parts = address.split(".").map(Number);
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) return false;
  const [a, b, c] = parts;
  return a === 0
    || a === 10
    || a === 127
    || a >= 224
    || (a === 100 && b >= 64 && b <= 127)
    || (a === 169 && b === 254)
    || (a === 172 && b >= 16 && b <= 31)
    || (a === 192 && b === 168)
    || (a === 192 && b === 0 && (c === 0 || c === 2))
    || (a === 198 && (b === 18 || b === 19 || b === 51))
    || (a === 203 && b === 0 && c === 113);
}

export function normalizeWebhookEvents(input: unknown): string[] {
  if (!Array.isArray(input)) return [];
  return Array.from(new Set(
    input
      .map(String)
      .map((event) => event.trim())
      .filter(Boolean)
      .slice(0, 100),
  ));
}
