import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";
import { test } from "node:test";
import { builtinModules } from "node:module";

async function walk(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) files.push(...await walk(path));
    else if (entry.name === "route.ts") files.push(path);
  }
  return files;
}

const publicMutationPatterns = [
  /api\/auth\//,
  /api\/forms\/\[id\]\/submit/,
  /api\/nps\/submit/,
  /api\/integrations\/stripe\/webhook/,
  /api\/integrations\/resend\/webhook/,
  /api\/broadcasts\/\[id\]\/dispatch/,
  /api\/automation\/resume\/\[id\]/,
];

test("tenant API routes use the centralized guard", async () => {
  const files = await walk(new URL("../src/app/api", import.meta.url).pathname);
  const violations = [];
  for (const file of files) {
    const source = await readFile(file, "utf8");
    const hasTenantContext = source.includes('x-tenant-id') || source.includes('x-user-id');
    const signedPublic = publicMutationPatterns.some((pattern) => pattern.test(file));
    if (hasTenantContext && !signedPublic && !source.includes("withApiGuard") && !source.includes("withApiKeyGuard")) violations.push(file);
  }
  assert.deepEqual(violations, []);
});

test("production source does not contain known insecure fallback secrets", async () => {
  const files = await walk(new URL("../src/app/api", import.meta.url).pathname);
  const violations = [];
  for (const file of files) {
    const source = await readFile(file, "utf8");
    if (/dev-secret-change-in-prod|sk_test_[A-Za-z0-9]+|whsec_[A-Za-z0-9]+/.test(source)) violations.push(file);
  }
  assert.deepEqual(violations, []);
});

test("integration connection routes do not create boolean connected states", async () => {
  const directory = new URL("../src/app/api/integrations", import.meta.url).pathname;
  const files = await walk(directory);
  const violations = [];
  for (const file of files) {
    const source = await readFile(file, "utf8");
    if (/integrations\s*:\s*\{[^}]*\btrue\b/s.test(source) || /connected\s*:\s*true/.test(source)) violations.push(file);
  }
  assert.deepEqual(violations, []);
});

test("authenticated browser mutations require a CSRF token", async () => {
  const guard = await readFile(new URL("../src/lib/api-guard.ts", import.meta.url), "utf8");
  const client = await readFile(new URL("../src/lib/org.ts", import.meta.url), "utf8");
  const middleware = await readFile(new URL("../src/middleware.ts", import.meta.url), "utf8");
  assert.match(guard, /isValidCsrfToken\(request\)/);
  assert.match(client, /x-csrf-token/);
  assert.match(middleware, /convert_csrf/);
});

test("customer analytics and workflow UI do not claim unsupported predictions or manual MRR", async () => {
  const predictions = await readFile(new URL("../src/app/ai/predictions/page.tsx", import.meta.url), "utf8");
  const customers = await readFile(new URL("../src/app/analytics/customers/page.tsx", import.meta.url), "utf8");
  const revenue = await readFile(new URL("../src/app/analytics/revenue/page.tsx", import.meta.url), "utf8");
  assert.doesNotMatch(predictions, /AI Predictions|% likelihood|% forecast/);
  assert.doesNotMatch(customers, /Average LTV|Lifetime revenue|conversion/);
  assert.doesNotMatch(revenue, /Log Month|Log Monthly Revenue/);
});


test("Resend delivery webhooks verify raw payloads and deduplicate provider events", async () => {
  const route = await readFile(new URL("../src/app/api/integrations/resend/webhook/route.ts", import.meta.url), "utf8");
  const helper = await readFile(new URL("../src/lib/resend-webhook.ts", import.meta.url), "utf8");
  const sender = await readFile(new URL("../src/lib/campaign-send.ts", import.meta.url), "utf8");
  assert.match(route, /const rawBody = await request\.text\(\)/);
  assert.match(route, /verifyResendWebhook\(resend, rawBody, headers, secret\)/);
  assert.match(helper, /client\.webhooks\.verify\(\{ payload, headers, webhookSecret \}\)/);
  assert.doesNotMatch(route, /webhooks\.verify\(\{[^}]*secret/s);
  assert.match(route, /externalEventId: headers\.id/);
  assert.match(route, /onConflictDoNothing\(\)/);
  assert.match(route, /emailSuppressions/);
  assert.doesNotMatch(route, /await request\.json\(\)/);
  assert.match(sender, /nxtgen_delivery_id/);
});


test("operational health reports recorded signals without exposing secret values", async () => {
  const route = await readFile(new URL("../src/app/api/operations/health/route.ts", import.meta.url), "utf8");
  const operations = await readFile(new URL("../src/lib/operations.ts", import.meta.url), "utf8");
  assert.match(route, /attention_required|no_recorded_critical_failures/);
  assert.match(route, /Boolean\(process\.env\.RESEND_API_KEY\)/);
  assert.match(route, /connectors\.find\(\(connector\) => connector\.provider === "stripe"\)/);
  assert.match(route, /connected: stripeConnector\?\.status === "connected"/);
  assert.doesNotMatch(route, /STRIPE_SECRET_KEY|STRIPE_WEBHOOK_SECRET/);
  assert.doesNotMatch(route, /RESEND_API_KEY\s*[:,]\s*process\.env/);
  assert.match(operations, /\[redacted\]/);
  assert.match(operations, /withTenantDatabase/);
});

test("customer success routes are governed and health language is evidence based", async () => {
  const authz = await readFile(new URL("../src/lib/authz.ts", import.meta.url), "utf8");
  const health = await readFile(new URL("../src/lib/customer-health.ts", import.meta.url), "utf8");
  const publish = await readFile(new URL("../src/app/api/customer-success/playbooks/[id]/publish/route.ts", import.meta.url), "utf8");
  const rollback = await readFile(new URL("../src/app/api/customer-success/playbooks/[id]/rollback/route.ts", import.meta.url), "utf8");
  assert.match(authz, /\/api\/customer-success/);
  assert.match(health, /not a churn prediction/);
  assert.match(publish, /status: "published"/);
  assert.match(rollback, /eq\(customerSuccessPlaybookVersions\.status, "published"\)/);
});

test("loyalty points are posted through governed ledger controls", async () => {
  const authz = await readFile(new URL("../src/lib/authz.ts", import.meta.url), "utf8");
  const ledger = await readFile(new URL("../src/lib/loyalty-ledger.ts", import.meta.url), "utf8");
  const transactionRoute = await readFile(new URL("../src/app/api/loyalty/transactions/route.ts", import.meta.url), "utf8");
  assert.match(authz, /\/api\/loyalty/);
  assert.match(ledger, /FOR UPDATE/);
  assert.match(ledger, /idempotencyKey/);
  assert.match(ledger, /daily_earn_limit/);
  assert.match(ledger, /status: held \? "held" : "posted"/);
  assert.match(transactionRoute, /postLoyaltyTransaction/);
  assert.doesNotMatch(transactionRoute, /update\(loyaltyPointTransactions\)/);
});


test("journey outcomes separate goals, exits, and completion", async () => {
  const automation = await readFile(new URL("../src/lib/automation.ts", import.meta.url), "utf8");
  const validator = await readFile(new URL("../src/lib/workflow-validation.ts", import.meta.url), "utf8");
  assert.match(automation, /workflowGoalEvents/);
  assert.match(automation, /workflowExperimentAssignments/);
  assert.match(automation, /status: "exited"/);
  assert.match(validator, /onTrueIndex/);
  assert.match(validator, /exitOnMatch/);
  assert.doesNotMatch(automation, /conversionRate.*completedCount/);
});


test("personalization decisions are scoped, deterministic, and connector honest", async () => {
  const publicRoute = await readFile(new URL("../src/app/api/public/v1/personalization/decide/route.ts", import.meta.url), "utf8");
  const service = await readFile(new URL("../src/lib/personalization.ts", import.meta.url), "utf8");
  const page = await readFile(new URL("../src/app/personalization/page.tsx", import.meta.url), "utf8");
  assert.match(publicRoute, /withApiKeyGuard\("personalization:decide"/);
  assert.match(service, /personalizationSubjectHash/);
  assert.match(service, /onConflictDoNothing/);
  assert.match(service, /contactMatchesSegment/);
  assert.match(page, /does not claim that any external site or messaging provider is connected/);
});

test("campaign delivery truth cannot be forged by browser mutations", async () => {
  const route = await readFile(new URL("../src/app/api/campaigns/[id]/route.ts", import.meta.url), "utf8");
  const create = await readFile(new URL("../src/app/api/campaigns/route.ts", import.meta.url), "utf8");
  const sender = await readFile(new URL("../src/lib/campaign-send.ts", import.meta.url), "utf8");
  assert.doesNotMatch(route, /allowed\.stats\s*=/);
  assert.match(route, /delivery states are controlled by the delivery engine/);
  assert.match(create, /Only the verified email delivery channel is currently operational/);
  assert.match(sender, /campaign\.type !== "email"/);
});

test("operational signals are explicitly rule based and contain no simulated analysis", async () => {
  const endpoint = await readFile(new URL("../src/app/api/ai-insights/route.ts", import.meta.url), "utf8");
  const page = await readFile(new URL("../src/app/ai/insights/page.tsx", import.meta.url), "utf8");
  const panel = await readFile(new URL("../src/components/dashboard/AIInsights.tsx", import.meta.url), "utf8");
  assert.match(endpoint, /deterministic_rules/);
  assert.match(endpoint, /not predictions or machine-learning outputs/);
  assert.match(page, /Operational Signals/);
  assert.match(page, /It is not a purchase probability, forecast, or machine-learning prediction/);
  assert.doesNotMatch(page, /setTimeout\(\(\) => setIsAnalyzing/);
  assert.doesNotMatch(page, /ScatterChart|jitter derived/);
  assert.doesNotMatch(panel, />AI Intelligence</);
});

test("active product screens do not expose inert action buttons", async () => {
  async function walkTsx(directory) {
    const entries = await readdir(directory, { withFileTypes: true });
    const files = [];
    for (const entry of entries) {
      const path = join(directory, entry.name);
      if (entry.isDirectory()) files.push(...await walkTsx(path));
      else if (entry.name.endsWith(".tsx")) files.push(path);
    }
    return files;
  }
  const roots = [
    new URL("../src/app", import.meta.url).pathname,
    new URL("../src/components", import.meta.url).pathname,
  ];
  const violations = [];
  for (const root of roots) {
    for (const file of await walkTsx(root)) {
      const source = await readFile(file, "utf8");
      for (const tag of ["Button", "button"]) {
        const pattern = new RegExp(`<${tag}\\b([^>]*)>`, "gs");
        for (const match of source.matchAll(pattern)) {
          const attributes = match[1];
          const isComponentImplementation = attributes.includes("{...props}");
          const operational = /onClick=|type=["']submit["']|href=|disabled=/.test(attributes);
          if (!isComponentImplementation && !operational) violations.push(`${file}:${tag}`);
        }
      }
    }
  }
  assert.deepEqual(violations, []);
});

test("campaign scheduling and revenue claims only appear where production support exists", async () => {
  const campaignRoute = await readFile(new URL("../src/app/api/campaigns/[id]/route.ts", import.meta.url), "utf8");
  const broadcastsRoute = await readFile(new URL("../src/app/api/broadcasts/route.ts", import.meta.url), "utf8");
  const emailCampaigns = await readFile(new URL("../src/app/email/campaigns/page.tsx", import.meta.url), "utf8");
  const marketingCampaigns = await readFile(new URL("../src/app/marketing/campaigns/page.tsx", import.meta.url), "utf8");
  assert.doesNotMatch(campaignRoute, /allowed\.scheduledAt|allowed\.sentAt/);
  assert.doesNotMatch(campaignRoute, /\["draft", "scheduled", "paused", "cancelled"\]/);
  assert.match(broadcastsRoute, /publishQStashMessage/);
  assert.match(broadcastsRoute, /Schedule date must be in the future/);
  assert.doesNotMatch(emailCampaigns, /Revenue Attributed|>Revenue</);
  assert.doesNotMatch(marketingCampaigns, /Revenue Attributed|>Revenue</);
});


test("administrative read authorization is evaluated before generic safe methods", async () => {
  const authz = await readFile(new URL("../src/lib/authz.ts", import.meta.url), "utf8");
  const adminIndex = authz.indexOf("ADMINISTRATIVE_PREFIXES.some");
  const safeIndex = authz.indexOf("[\"GET\", \"HEAD\", \"OPTIONS\"]");
  assert.ok(adminIndex >= 0);
  assert.ok(safeIndex > adminIndex);
});

test("campaign analytics use typed aggregation and exclude unsupported revenue", async () => {
  const route = await readFile(new URL("../src/app/api/analytics/campaigns/route.ts", import.meta.url), "utf8");
  const helper = await readFile(new URL("../src/lib/campaign-analytics.ts", import.meta.url), "utf8");
  const page = await readFile(new URL("../src/app/analytics/campaigns/page.tsx", import.meta.url), "utf8");
  assert.match(route, /addCampaignStats/);
  assert.match(helper, /CampaignDeliveryStats/);
  assert.doesNotMatch(route, /revenue/);
  assert.doesNotMatch(page, /revenue:/);
});


test("production imports are backed by declared dependencies", async () => {
  const packageJson = JSON.parse(await readFile(new URL("../package.json", import.meta.url), "utf8"));
  const declared = new Set([
    ...Object.keys(packageJson.dependencies ?? {}),
    ...Object.keys(packageJson.devDependencies ?? {}),
  ]);
  const builtins = new Set([...builtinModules, ...builtinModules.map((name) => `node:${name}`)]);
  const sourceRoot = new URL("../src", import.meta.url).pathname;

  async function walkSource(directory) {
    const entries = await readdir(directory, { withFileTypes: true });
    const files = [];
    for (const entry of entries) {
      const path = join(directory, entry.name);
      if (entry.isDirectory()) files.push(...await walkSource(path));
      else if (/\.tsx?$/.test(entry.name)) files.push(path);
    }
    return files;
  }

  const violations = [];
  const files = await walkSource(sourceRoot);
  for (const file of files) {
    const source = await readFile(file, "utf8");
    const imports = source.matchAll(/(?:from\s+|import\s*\()(["'])([^"']+)\1/g);
    for (const match of imports) {
      const specifier = match[2];
      if (specifier.startsWith(".") || specifier.startsWith("@/") || builtins.has(specifier)) continue;
      const root = specifier.startsWith("@")
        ? specifier.split("/").slice(0, 2).join("/")
        : specifier.split("/")[0];
      if (!declared.has(root)) violations.push(`${file}: ${specifier}`);
    }
  }
  assert.deepEqual(violations, []);
});

test("framework security patch and lockfile remain aligned", async () => {
  const packageJson = JSON.parse(await readFile(new URL("../package.json", import.meta.url), "utf8"));
  const lock = JSON.parse(await readFile(new URL("../package-lock.json", import.meta.url), "utf8"));
  assert.equal(packageJson.dependencies.next, "16.2.11");
  assert.equal(packageJson.devDependencies["eslint-config-next"], "16.2.11");
  assert.equal(lock.packages[""].dependencies.next, "16.2.11");
  assert.equal(lock.packages[""].devDependencies["eslint-config-next"], "16.2.11");
  assert.equal(lock.packages["node_modules/next"].version, "16.2.11");
  assert.equal(lock.packages["node_modules/@next/env"].version, "16.2.11");
  assert.equal(lock.packages["node_modules/eslint-config-next"].version, "16.2.11");
  assert.equal(lock.packages["node_modules/@next/eslint-plugin-next"].version, "16.2.11");
  assert.equal(packageJson.overrides.sharp, "0.35.3");
  assert.equal(lock.packages["node_modules/sharp"].version, "0.35.3");
  assert.equal(lock.packages["node_modules/@img/sharp-linux-x64"].version, "0.35.3");
  assert.equal(lock.packages["node_modules/@img/sharp-libvips-linux-x64"].version, "1.3.2");
  for (const [name, version] of Object.entries(lock.packages["node_modules/next"].optionalDependencies)) {
    if (name.startsWith("@next/swc-")) assert.equal(version, "16.2.11");
  }
});

test("production checks remain enabled", async () => {
  const packageJson = JSON.parse(await readFile(new URL("../package.json", import.meta.url), "utf8"));
  const eslintConfig = await readFile(new URL("../eslint.config.mjs", import.meta.url), "utf8");
  const tsconfig = JSON.parse(await readFile(new URL("../tsconfig.json", import.meta.url), "utf8"));
  assert.equal(packageJson.scripts.typecheck, "tsc --noEmit");
  assert.equal(packageJson.scripts.lint, "eslint .");
  assert.equal(packageJson.scripts.build, "next build");
  assert.match(eslintConfig, /eslint-config-next\/core-web-vitals/);
  assert.doesNotMatch(eslintConfig, /rules\s*:\s*\{[^}]*:\s*["']off["']/s);
  assert.equal(tsconfig.compilerOptions.strict, true);
});


test("production source remains free of lint and type-check escape hatches", async () => {
  async function walkProductionSource(directory) {
    const entries = await readdir(directory, { withFileTypes: true });
    const files = [];
    for (const entry of entries) {
      const path = join(directory, entry.name);
      if (entry.isDirectory()) files.push(...await walkProductionSource(path));
      else if (/\.(?:ts|tsx)$/.test(entry.name)) files.push(path);
    }
    return files;
  }

  const sourceRoot = new URL("../src", import.meta.url).pathname;
  const violations = [];
  for (const file of await walkProductionSource(sourceRoot)) {
    const source = await readFile(file, "utf8");
    if (/eslint-disable|@ts-ignore|@ts-nocheck|@ts-expect-error/.test(source)) {
      violations.push(`${file}: disabled static check`);
    }
    if (file.endsWith(".tsx") && /<img\b/.test(source)) {
      violations.push(`${file}: raw img element`);
    }
  }
  assert.deepEqual(violations, []);
});

test("V4 UI lint and type regressions remain fixed", async () => {
  const sourceRoot = new URL("../src", import.meta.url).pathname;

  async function walkTsx(directory) {
    const entries = await readdir(directory, { withFileTypes: true });
    const files = [];
    for (const entry of entries) {
      const path = join(directory, entry.name);
      if (entry.isDirectory()) files.push(...await walkTsx(path));
      else if (entry.name.endsWith(".tsx")) files.push(path);
    }
    return files;
  }

  const nps = await readFile(new URL("../src/app/survey/nps/[token]/page.tsx", import.meta.url), "utf8");
  const layout = await readFile(new URL("../src/app/layout.tsx", import.meta.url), "utf8");
  const settings = await readFile(new URL("../src/app/settings/page.tsx", import.meta.url), "utf8");
  const sidebar = await readFile(new URL("../src/components/layout/Sidebar.tsx", import.meta.url), "utf8");
  const initialLoadPages = [
    "../src/app/automation/templates/page.tsx",
    "../src/app/email/templates/page.tsx",
    "../src/app/automation/workflows/page.tsx",
  ];

  assert.match(nps, /import Image from ["']next\/image["'];/);
  assert.doesNotMatch(layout, /next\/font\/google|fonts\.googleapis\.com/);
  assert.doesNotMatch(layout, /fonts\.googleapis\.com|<link\b/);
  assert.match(settings, /setAttribute\(["']data-density["']/);
  assert.doesNotMatch(settings, /dataset\.density\s*=/);
  assert.match(sidebar, /<Link href=["']\/["']/);

  for (const relativePath of initialLoadPages) {
    const source = await readFile(new URL(relativePath, import.meta.url), "utf8");
    assert.match(source, /let active = true;/);
    assert.match(source, /return \(\) => \{\s*active = false;\s*\};/s);
    assert.doesNotMatch(source, /Promise\.resolve\(\)\.then\(load/);
  }

  const internalAnchors = [];
  for (const file of await walkTsx(sourceRoot)) {
    const source = await readFile(file, "utf8");
    if (/<a\s+[^>]*href=["']\/(?!api\/)/.test(source)) internalAnchors.push(file);
  }
  assert.deepEqual(internalAnchors, []);
});



test("invite acceptance keeps useSearchParams behind a Suspense boundary", async () => {
  const page = await readFile(new URL("../src/app/invite/accept/page.tsx", import.meta.url), "utf8");
  assert.match(page, /import \{ Suspense, useEffect, useState \} from ["']react["'];/);
  assert.match(page, /function AcceptInvitationContent\(\)/);
  assert.match(page, /const params = useSearchParams\(\);/);
  assert.match(page, /<Suspense fallback=\{<InvitationCard message="Validating your invitation…" \/>\}>/);
  assert.match(page, /<AcceptInvitationContent \/>/);
  assert.match(page, /let active = true;/);
  assert.match(page, /return \(\) => \{\s*active = false;\s*\};/s);
});

test("all App Router pages using useSearchParams keep the hook below Suspense", async () => {
  const appRoot = new URL("../src/app", import.meta.url).pathname;

  async function walkPages(directory) {
    const entries = await readdir(directory, { withFileTypes: true });
    const files = [];
    for (const entry of entries) {
      const path = join(directory, entry.name);
      if (entry.isDirectory()) files.push(...await walkPages(path));
      else if (entry.name === "page.tsx") files.push(path);
    }
    return files;
  }

  const violations = [];
  for (const file of await walkPages(appRoot)) {
    const source = await readFile(file, "utf8");
    const hookIndex = source.indexOf("useSearchParams()");
    if (hookIndex === -1) continue;
    const defaultExportIndex = source.indexOf("export default function");
    const defaultExport = defaultExportIndex === -1 ? "" : source.slice(defaultExportIndex);
    if (defaultExportIndex === -1 || hookIndex > defaultExportIndex || !defaultExport.includes("<Suspense")) {
      violations.push(file);
    }
  }

  assert.deepEqual(violations, []);
});

test("Stage 2 build imports are credential and network lazy", async () => {
  const database = await readFile(new URL("../src/db/index.ts", import.meta.url), "utf8");
  const layout = await readFile(new URL("../src/app/layout.tsx", import.meta.url), "utf8");
  const globals = await readFile(new URL("../src/app/globals.css", import.meta.url), "utf8");
  assert.match(database, /function requireDatabaseUrl/);
  assert.match(database, /export function getPool/);
  assert.match(database, /new Proxy\(\{\} as Pool/);
  assert.doesNotMatch(database, /const databaseUrl = process\.env\.DATABASE_URL;\s*\n\s*if \(!databaseUrl\)/);
  assert.doesNotMatch(layout, /next\/font\/google|fonts\.googleapis\.com/);
  assert.match(globals, /ui-sans-serif/);
});

test("Stage 2 release readiness never invents external validation", async () => {
  const helper = await readFile(new URL("../src/lib/release-readiness.ts", import.meta.url), "utf8");
  const route = await readFile(new URL("../src/app/api/operations/readiness/route.ts", import.meta.url), "utf8");
  const page = await readFile(new URL("../src/app/operations/page.tsx", import.meta.url), "utf8");
  assert.match(helper, /recorded_validation_evidence/);
  assert.match(helper, /not_validated/);
  assert.match(route, /Status is derived only from recorded validation evidence/);
  assert.match(page, /Record only completed validation/);
  assert.doesNotMatch(page, /automatically verified|live validated|production ready by default/i);
});
