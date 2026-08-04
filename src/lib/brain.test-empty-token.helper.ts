/**
 * Subprocess helper for brain.test.ts Test 4.
 * Run with BRAIN_SERVICE_TOKEN="" so the module-level constant is empty.
 * Asserts fetchBrainContext returns "" and that fetch is never invoked.
 */
import assert from "node:assert/strict";

(async () => {
  let fetchCalled = false;
  (globalThis as unknown as Record<string, unknown>).fetch = async () => {
    fetchCalled = true;
    return { ok: false, json: async () => ({}) };
  };

  // Module reads BRAIN_SERVICE_TOKEN at load time — must be empty before import
  process.env.BRAIN_SERVICE_TOKEN = "";

  const { fetchBrainContext } = await import("./brain");
  const result = await fetchBrainContext(1000);

  assert.equal(result, "", `guard failed: expected '' when token empty, got "${result}"`);
  assert.equal(fetchCalled, false, "fetch must NOT be called when BRAIN_SERVICE_TOKEN is empty");
  process.stdout.write("PASS: BRAIN_SERVICE_TOKEN unset → '' returned, fetch never called\n");
})().catch((err: unknown) => {
  process.stderr.write(`FAILED: ${err instanceof Error ? err.message : String(err)}\n`);
  process.exit(1);
});
