const BRAIN_URL = process.env.BRAIN_URL ?? "https://brain.nxtgen-stack.com";
const BRAIN_API_KEY = process.env.BRAIN_API_KEY ?? "";
const BRAIN_SITE_ID = process.env.BRAIN_SITE_ID ?? "nxtgen-convert";

export async function fetchBrainContext(maxChars = 8000): Promise<string> {
  if (!BRAIN_API_KEY) return "";
  try {
    const url = `${BRAIN_URL}/api/context.php?site_id=${BRAIN_SITE_ID}&max_chars=${maxChars}`;
    const res = await fetch(url, {
      headers: { "X-Brain-Key": BRAIN_API_KEY },
      next: { revalidate: 300 }, // cache for 5 min — brain context changes rarely
    });
    if (!res.ok) return "";
    const data = await res.json();
    return data.ok && data.context ? String(data.context) : "";
  } catch (err) {
    console.error("[brain] context fetch failed:", err);
    return "";
  }
}
