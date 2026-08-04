import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

test("foundation migration is additive and has a down migration", async () => {
  const up = await readFile(new URL("../drizzle/0002_foundation_first.sql", import.meta.url), "utf8");
  const down = await readFile(new URL("../drizzle/0002_foundation_first.down.sql", import.meta.url), "utf8");
  assert.match(up, /CREATE TABLE IF NOT EXISTS organization_memberships/);
  assert.match(up, /CREATE TABLE IF NOT EXISTS audit_events/);
  assert.match(up, /CREATE TABLE IF NOT EXISTS webhook_deliveries/);
  assert.match(up, /CREATE TABLE IF NOT EXISTS email_deliveries/);
  assert.match(up, /CREATE TABLE IF NOT EXISTS email_suppressions/);
  assert.doesNotMatch(up, /UPDATE organizations SET settings/);
  assert.match(down, /DROP TABLE IF EXISTS[\s\S]*webhook_deliveries/);
});

test("baseline covers all production foundation prerequisites", async () => {
  const baseline = await readFile(new URL("../drizzle/0000_baseline_schema.sql", import.meta.url), "utf8");
  for (const table of ["organizations", "users", "contacts", "companies", "deals", "campaigns", "workflows", "subscriptions"]) {
    assert.match(baseline, new RegExp(`CREATE TABLE IF NOT EXISTS ${table}\\b`));
  }
});

test("tenant integrity migration enforces new cross tenant writes and is reversible", async () => {
  const up = await readFile(new URL("../drizzle/0003_tenant_integrity.sql", import.meta.url), "utf8");
  const down = await readFile(new URL("../drizzle/0003_tenant_integrity.down.sql", import.meta.url), "utf8");
  assert.match(up, /FOREIGN KEY \(organization_id,%I\)/);
  assert.match(up, /NOT VALID/);
  assert.match(up, /nxtgen_enforce_user_membership/);
  assert.match(down, /DROP FUNCTION IF EXISTS nxtgen_enforce_user_membership/);
});

test("row level security is forced on core tenant tables and has a rollback", async () => {
  const up = await readFile(new URL("../drizzle/0004_row_level_security.sql", import.meta.url), "utf8");
  const down = await readFile(new URL("../drizzle/0004_row_level_security.down.sql", import.meta.url), "utf8");
  assert.match(up, /FORCE ROW LEVEL SECURITY/);
  assert.match(up, /WITH CHECK \(organization_id = nxtgen_current_tenant\(\)\)/);
  assert.match(down, /DISABLE ROW LEVEL SECURITY/);
  assert.match(down, /DROP FUNCTION IF EXISTS nxtgen_current_tenant/);
});

test("workflow definitions are immutable, tenant isolated, and reversible", async () => {
  const up = await readFile(new URL("../drizzle/0005_workflow_versioning.sql", import.meta.url), "utf8");
  const down = await readFile(new URL("../drizzle/0005_workflow_versioning.down.sql", import.meta.url), "utf8");
  assert.match(up, /CREATE TABLE IF NOT EXISTS workflow_versions/);
  assert.match(up, /CREATE TABLE IF NOT EXISTS workflow_active_versions/);
  assert.match(up, /workflow_version_id/);
  assert.match(up, /FORCE ROW LEVEL SECURITY/);
  assert.match(up, /workflow_enrollments_version_tenant_fk/);
  assert.match(down, /DROP TABLE IF EXISTS workflow_active_versions/);
  assert.match(down, /DROP TABLE IF EXISTS workflow_versions/);
});


test("operational telemetry is tenant isolated and reversible", async () => {
  const up = await readFile(new URL("../drizzle/0006_operational_observability.sql", import.meta.url), "utf8");
  const down = await readFile(new URL("../drizzle/0006_operational_observability.down.sql", import.meta.url), "utf8");
  assert.match(up, /CREATE TABLE IF NOT EXISTS operational_events/);
  assert.match(up, /FORCE ROW LEVEL SECURITY/);
  assert.match(up, /operational_events_tenant_isolation/);
  assert.match(down, /DROP TABLE IF EXISTS operational_events/);
});


test("customer profile and identity foundation is tenant isolated and reversible", async () => {
  const up = await readFile(new URL("../drizzle/0007_customer_profile_identity.sql", import.meta.url), "utf8");
  const down = await readFile(new URL("../drizzle/0007_customer_profile_identity.down.sql", import.meta.url), "utf8");
  for (const table of ["contact_identity_keys", "identity_resolution_candidates", "contact_relationships", "contact_lifecycle_history", "customer_timeline_events"]) {
    assert.match(up, new RegExp(`CREATE TABLE IF NOT EXISTS ${table}`));
  }
  assert.match(up, /FORCE ROW LEVEL SECURITY/);
  assert.match(up, /archived_at/);
  assert.match(down, /DROP TABLE IF EXISTS contact_identity_keys/);
  assert.match(down, /DROP COLUMN IF EXISTS archived_at/);
});

test("customer success foundation is versioned, evidence based, tenant isolated, and reversible", async () => {
  const up = await readFile(new URL("../drizzle/0008_customer_success.sql", import.meta.url), "utf8");
  const down = await readFile(new URL("../drizzle/0008_customer_success.down.sql", import.meta.url), "utf8");
  for (const table of ["customer_success_playbooks", "customer_success_playbook_versions", "customer_success_plans", "customer_success_milestones", "customer_renewals", "customer_health_assessments", "customer_risk_alerts"]) {
    assert.match(up, new RegExp(`CREATE TABLE IF NOT EXISTS ${table}`));
    assert.match(down, new RegExp(`DROP TABLE IF EXISTS ${table}`));
  }
  assert.match(up, /active_version_id/);
  assert.match(up, /checksum text NOT NULL/);
  assert.match(up, /methodology_version text NOT NULL/);
  assert.match(up, /FORCE ROW LEVEL SECURITY/);
});

test("loyalty uses immutable versioned programs and an append-only tenant ledger", async () => {
  const up = await readFile(new URL("../drizzle/0009_loyalty_governance.sql", import.meta.url), "utf8");
  const down = await readFile(new URL("../drizzle/0009_loyalty_governance.down.sql", import.meta.url), "utf8");
  for (const table of ["loyalty_programs", "loyalty_program_versions", "loyalty_tiers", "loyalty_accounts", "loyalty_point_transactions", "customer_referrals", "loyalty_fraud_reviews"]) {
    assert.match(up, new RegExp(`CREATE TABLE IF NOT EXISTS ${table}`));
    assert.match(down, new RegExp(`DROP TABLE IF EXISTS ${table}`));
  }
  assert.match(up, /loyalty_point_transactions_immutable/);
  assert.match(up, /append-only/);
  assert.match(up, /idempotency_key text NOT NULL/);
  assert.match(up, /FORCE ROW LEVEL SECURITY/);
});


test("journey orchestration records goals and experiments with tenant isolation and rollback", async () => {
  const up = await readFile(new URL("../drizzle/0010_journey_orchestration.sql", import.meta.url), "utf8");
  const down = await readFile(new URL("../drizzle/0010_journey_orchestration.down.sql", import.meta.url), "utf8");
  for (const table of ["workflow_goal_events", "workflow_experiment_assignments"]) {
    assert.match(up, new RegExp(`CREATE TABLE IF NOT EXISTS ${table}`));
    assert.match(down, new RegExp(`DROP TABLE IF EXISTS ${table}`));
  }
  assert.match(up, /exit_type/);
  assert.match(up, /goal_reached_at/);
  assert.match(up, /FORCE ROW LEVEL SECURITY/);
  assert.match(up, /workflow_goal_events_enrollment_goal_uidx/);
  assert.match(up, /workflow_experiment_assignments_enrollment_step_uidx/);
});


test("segmentation and personalization are versioned, tenant isolated, and reversible", async () => {
  const up = await readFile(new URL("../drizzle/0011_segmentation_personalization.sql", import.meta.url), "utf8");
  const down = await readFile(new URL("../drizzle/0011_segmentation_personalization.down.sql", import.meta.url), "utf8");
  for (const table of ["customer_segments", "customer_segment_versions", "customer_segment_active_versions", "personalization_experiences", "personalization_experience_versions", "personalization_active_versions", "personalization_assignments"]) {
    assert.match(up, new RegExp(`CREATE TABLE IF NOT EXISTS ${table}`));
    assert.match(down, new RegExp(`DROP TABLE IF EXISTS ${table}`));
  }
  assert.match(up, /FORCE ROW LEVEL SECURITY/);
  assert.match(up, /subject_key_hash text NOT NULL/);
  assert.match(up, /personalization_assignments_subject_uidx/);
});


test("security array columns are normalized, non-null, and reversible", async () => {
  const up = await readFile(new URL("../drizzle/0012_non_null_security_arrays.sql", import.meta.url), "utf8");
  const down = await readFile(new URL("../drizzle/0012_non_null_security_arrays.down.sql", import.meta.url), "utf8");
  for (const [table, column] of [["connector_accounts", "scopes"], ["api_keys", "scopes"], ["webhook_endpoints", "events"]]) {
    assert.equal(up.includes(`UPDATE ${table} SET ${column} = ARRAY[]::text[] WHERE ${column} IS NULL`), true);
    assert.equal(up.includes(`ALTER TABLE ${table} ALTER COLUMN ${column} SET NOT NULL`), true);
    assert.equal(down.includes(`ALTER TABLE ${table} ALTER COLUMN ${column} DROP NOT NULL`), true);
  }
});


test("release validation evidence is append only, tenant isolated, and reversible", async () => {
  const up = await readFile(new URL("../drizzle/0013_release_validation_evidence.sql", import.meta.url), "utf8");
  const down = await readFile(new URL("../drizzle/0013_release_validation_evidence.down.sql", import.meta.url), "utf8");
  assert.match(up, /CREATE TABLE IF NOT EXISTS release_validation_events/);
  assert.match(up, /release validation evidence is append-only/);
  assert.match(up, /FORCE ROW LEVEL SECURITY/);
  assert.match(up, /release_validation_events_tenant_isolation/);
  assert.match(up, /release_validation_record_shape/);
  assert.match(up, /organization_id, idempotency_key/);
  assert.match(down, /DROP TABLE IF EXISTS release_validation_events/);
  assert.match(down, /DROP FUNCTION IF EXISTS nxtgen_release_validation_events_immutable/);
});
