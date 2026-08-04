-- Reversible structural rollback. Encrypted secrets, sessions, audit, keys, webhooks, consent, and invitation data will be deleted.
DROP TABLE IF EXISTS workflow_step_executions, email_suppressions, email_deliveries, email_tracking_events, contact_consents, api_rate_limits, integration_event_receipts, webhook_deliveries, webhook_endpoints,
  api_keys, connector_accounts, integration_secrets, audit_events, auth_sessions, organization_invitations, organization_memberships CASCADE;
DROP INDEX IF EXISTS organizations_space_tenant_uidx, users_space_user_uidx, users_email_lower_idx,
  contacts_org_id_uidx, companies_org_id_uidx, deals_org_id_uidx, workflows_org_id_uidx, products_org_id_uidx;
ALTER TABLE users DROP COLUMN IF EXISTS auth_version;
ALTER TABLE users DROP COLUMN IF EXISTS space_user_id;
ALTER TABLE organizations DROP COLUMN IF EXISTS space_tenant_id;
CREATE UNIQUE INDEX IF NOT EXISTS users_email_unique ON users(email);

DROP INDEX IF EXISTS workflow_enrollments_idempotency_uidx;
ALTER TABLE workflow_enrollments DROP COLUMN IF EXISTS updated_at, DROP COLUMN IF EXISTS completed_at, DROP COLUMN IF EXISTS lock_token, DROP COLUMN IF EXISTS locked_at, DROP COLUMN IF EXISTS last_error, DROP COLUMN IF EXISTS max_attempts, DROP COLUMN IF EXISTS attempt_count, DROP COLUMN IF EXISTS idempotency_key, DROP COLUMN IF EXISTS context, DROP COLUMN IF EXISTS event;
