/**
 * Unit tests for fetchBrainContext (brain.ts)
 *
 * Run: npx tsx src/lib/brain.test.ts
 *
 * Tests:
 *   1. Outgoing request uses Authorization: Bearer <token> — not X-Brain-Key
 *   2. Response {context: "..."} without ok field is parsed and returned
 *   3. Response {ok: true, context: "..."} is also parsed correctly
 *   4. Empty BRAIN_SERVICE_TOKEN → returns "" and fetch is never called
 *        (proven in a fresh subprocess so module constants load unset)
 *   5. Non-200 HTTP status → returns ""
 */
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import type { IncomingMessage, ServerResponse } from "node:http";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const TEST_TOKEN   = "brn_staging_unit_test_token_000000000000";
const TEST_CONTEXT = "Brain knowledge base content for unit test.";

const __filename = fileURLToPath(import.meta.url);
const __dirname  = dirname(__filename);

// ── Minimal HTTP test server ─────────────────────────────────────────────────

type Handler = (req: IncomingMessage, res: ServerResponse) => void;

async function startServer(handler: Handler): Promise<{ url: string; close: () => void }> {
  const server = createServer(handler);
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  const { port } = server.address() as AddressInfo;
  return { url: `http://127.0.0.1:${port}`, close: () => server.close() };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

(async () => {
  let passed = 0;

  // Set env vars BEFORE dynamic-importing brain.ts so module-level constants
  // (BRAIN_URL, BRAIN_SERVICE_TOKEN) capture these values on first load.
  process.env.BRAIN_SERVICE_TOKEN = TEST_TOKEN;

  // ── Test 1 & 2 combined: Bearer auth + context-without-ok ────────────────
  {
    let capturedHeaders: Record<string, string> = {};

    const { url, close } = await startServer((req, res) => {
      capturedHeaders = {};
      for (const [k, v] of Object.entries(req.headers)) capturedHeaders[k] = String(v);
      // Brain returns {context, tenant_id} — NO ok field
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ context: TEST_CONTEXT, tenant_id: "test-tenant" }));
    });

    process.env.BRAIN_URL = url;
    const { fetchBrainContext } = await import("./brain");
    const result = await fetchBrainContext(1000);
    close();

    // Test 1: Bearer auth header, no X-Brain-Key
    assert.equal(
      capturedHeaders["authorization"],
      `Bearer ${TEST_TOKEN}`,
      `Authorization must be 'Bearer ${TEST_TOKEN}' — got: '${capturedHeaders["authorization"]}'`
    );
    assert.equal(capturedHeaders["x-brain-key"], undefined, "X-Brain-Key must NOT be sent");
    console.log("PASS 1: Authorization: Bearer <token> sent, X-Brain-Key absent");
    passed++;

    // Test 2: {context} without ok → non-empty return
    assert.equal(
      result,
      TEST_CONTEXT,
      `fetchBrainContext must return data.context without requiring ok — got: "${result}"`
    );
    console.log("PASS 2: {context: '...'} without ok field returned correctly");
    passed++;
  }

  // ── Test 3: {ok: true, context: "..."} also works ────────────────────────
  {
    const { url, close } = await startServer((_req, res) => {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ ok: true, context: "With ok present.", tenant_id: "t" }));
    });

    const origFetch = globalThis.fetch;
    globalThis.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
      const redirected = String(input).replace(/^https?:\/\/[^/]+/, url);
      return origFetch(redirected, init);
    };

    const { fetchBrainContext } = await import("./brain");
    const result = await fetchBrainContext(1000);
    globalThis.fetch = origFetch;
    close();

    assert.equal(result, "With ok present.", "context must be returned when ok field is also present");
    console.log("PASS 3: {ok: true, context: '...'} parsed correctly");
    passed++;
  }

  // ── Test 4: empty token → "" and fetch never called ──────────────────────
  // Module-level constants can't change in a cached module, so we spawn a
  // fresh subprocess with BRAIN_SERVICE_TOKEN unset and verify the guard fires.
  {
    const helperPath = resolve(__dirname, "brain.test-empty-token.helper.ts");
    const proc = spawnSync(
      "npx", ["tsx", helperPath],
      {
        env: { ...process.env, BRAIN_SERVICE_TOKEN: "", BRAIN_URL: "" },
        encoding: "utf8",
        cwd: resolve(__dirname, "../../.."),
      }
    );
    if (proc.status !== 0 || !proc.stdout.includes("PASS:")) {
      throw new Error(
        `empty-token subprocess failed (exit ${proc.status}):\n` +
        `stdout: ${proc.stdout}\nstderr: ${proc.stderr}`
      );
    }
    console.log(`PASS 4: ${proc.stdout.trim()}`);
    passed++;
  }

  // ── Test 5: non-200 status → "" ──────────────────────────────────────────
  {
    const { url, close } = await startServer((_req, res) => {
      res.writeHead(503, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "unavailable" }));
    });

    const origFetch = globalThis.fetch;
    globalThis.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
      const redirected = String(input).replace(/^https?:\/\/[^/]+/, url);
      return origFetch(redirected, init);
    };

    const { fetchBrainContext } = await import("./brain");
    const result = await fetchBrainContext(1000);
    globalThis.fetch = origFetch;
    close();

    assert.equal(result, "", "non-200 HTTP status must return empty string");
    console.log("PASS 5: HTTP 503 → empty string returned");
    passed++;
  }

  console.log(`\n${passed}/5 brain.ts unit tests PASSED`);
})().catch((err: unknown) => {
  const msg = err instanceof Error ? err.message : String(err);
  console.error("FAILED:", msg);
  process.exit(1);
});
