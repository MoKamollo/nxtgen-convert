const BRAIN_URL           = process.env.BRAIN_URL            ?? "https://brain.nxtgen-stack.com";
const BRAIN_SERVICE_TOKEN = process.env.BRAIN_SERVICE_TOKEN  ?? "";

export async function fetchBrainContext(maxChars = 8000): Promise<string> {
  if (!BRAIN_SERVICE_TOKEN) return "";
  try {
    const url = `${BRAIN_URL}/api/context.php?max_chars=${maxChars}`;
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${BRAIN_SERVICE_TOKEN}` },
      next: { revalidate: 300 }, // cache for 5 min — brain context changes rarely
    });
    if (!res.ok) return "";
    const data = await res.json();
    return data.context ? String(data.context) : "";
  } catch (err) {
    console.error("[brain] context fetch failed:", err);
    return "";
  }
}
