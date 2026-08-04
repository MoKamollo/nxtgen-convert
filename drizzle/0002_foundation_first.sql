-- Foundation First hardening. All changes are additive except removal of the legacy global email uniqueness constraint.
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS space_tenant_id text;
CREATE UNIQUE INDEX IF NOT EXISTS organizations_space_tenant_uidx ON organizations(space_tenant_id) WHERE space_tenant_id IS NOT NULL;
ALTER TABLE users ADD COLUMN IF NOT EXISTS space_user_id text;
ALTER TABLE users ADD COLUMN IF NOT EXISTS auth_version integer NOT NULL DEFAULT 1;
ALTER TABLE workflow_enrollments ADD COLUMN IF NOT EXISTS event text NOT NULL DEFAULT 'manual';
ALTER TABLE workflow_enrollments ADD COLUMN IF NOT EXISTS context jsonb DEFAULT '{}'::jsonb;
ALTER TABLE workflow_enrollments ADD COLUMN IF NOT EXISTS idempotency_key text;
ALTER TABLE workflow_enrollments ADD COLUMN IF NOT EXISTS attempt_count integer NOT NULL DEFAULT 0;
ALTER TABLE workflow_enrollments ADD COLUMN IF NOT EXISTS max_attempts integer NOT NULL DEFAULT 5;
ALTER TABLE workflow_enrollments ADD COLUMN IF NOT EXISTS last_error text;
ALTER TABLE workflow_enrollments ADD COLUMN IF NOT EXISTS locked_at timestamp;
ALTER TABLE workflow_enrollments ADD COLUMN IF NOT EXISTS lock_token text;
ALTER TABLE workflow_enrollments ADD COLUMN IF NOT EXISTS completed_at timestamp;
ALTER TABLE workflow_enrollments ADD COLUMN IF NOT EXISTS updated_at timestamp NOT NULL DEFAULT now();
CREATE UNIQUE INDEX IF NOT EXISTS workflow_enrollments_idempotency_uidx ON workflow_enrollments(organization_id,workflow_id,idempotency_key);
CREATE INDEX IF NOT EXISTS workflow_enrollments_due_idx ON workflow_enrollments(status,resume_at);
CREATE TABLE IF NOT EXISTS workflow_step_executions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), organization_id uuid NOT NULL REFERENCES organizations(id), enrollment_id uuid NOT NULL REFERENCES workflow_enrollments(id),
  workflow_id uuid NOT NULL REFERENCES workflows(id), step_index integer NOT NULL, step_type text NOT NULL, status text NOT NULL DEFAULT 'processing',
  attempt_count integer NOT NULL DEFAULT 1, idempotency_key text NOT NULL, provider_message_id text, result jsonb DEFAULT '{}'::jsonb,
  last_error text, started_at timestamp NOT NULL DEFAULT now(), completed_at timestamp, updated_at timestamp NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS workflow_step_executions_enrollment_step_uidx ON workflow_step_executions(enrollment_id,step_index);
CREATE UNIQUE INDEX IF NOT EXISTS workflow_step_executions_idempotency_uidx ON workflow_step_executions(idempotency_key);
CREATE INDEX IF NOT EXISTS workflow_step_executions_org_time_idx ON workflow_step_executions(organization_id,started_at);

ALTER TABLE users DROP CONSTRAINT IF EXISTS users_email_unique;
DROP INDEX IF EXISTS users_email_unique;
CREATE UNIQUE INDEX IF NOT EXISTS users_space_user_uidx ON users(space_user_id) WHERE space_user_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS users_email_lower_idx ON users(lower(email));

CREATE TABLE IF NOT EXISTS organization_memberships (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), organization_id uuid NOT NULL REFERENCES organizations(id), user_id uuid NOT NULL REFERENCES users(id),
  role user_role NOT NULL DEFAULT 'member', status text NOT NULL DEFAULT 'active', version integer NOT NULL DEFAULT 1,
  joined_at timestamp NOT NULL DEFAULT now(), created_at timestamp NOT NULL DEFAULT now(), updated_at timestamp NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS organization_memberships_org_user_uidx ON organization_memberships(organization_id,user_id);
CREATE INDEX IF NOT EXISTS organization_memberships_user_idx ON organization_memberships(user_id);
CREATE INDEX IF NOT EXISTS organization_memberships_org_status_idx ON organization_memberships(organization_id,status);
INSERT INTO organization_memberships (organization_id,user_id,role,status)
SELECT organization_id,id,COALESCE(role,'member'),'active' FROM users WHERE organization_id IS NOT NULL
ON CONFLICT (organization_id,user_id) DO NOTHING;

CREATE TABLE IF NOT EXISTS organization_invitations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), organization_id uuid NOT NULL REFERENCES organizations(id), email text NOT NULL, name text,
  role user_role NOT NULL DEFAULT 'member', token_hash text NOT NULL UNIQUE, invited_by_user_id uuid REFERENCES users(id),
  status text NOT NULL DEFAULT 'pending', expires_at timestamp NOT NULL, accepted_at timestamp, revoked_at timestamp,
  created_at timestamp NOT NULL DEFAULT now(), updated_at timestamp NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS organization_invitations_org_email_idx ON organization_invitations(organization_id,email);
CREATE INDEX IF NOT EXISTS organization_invitations_status_expiry_idx ON organization_invitations(status,expires_at);

CREATE TABLE IF NOT EXISTS auth_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), organization_id uuid NOT NULL REFERENCES organizations(id), user_id uuid NOT NULL REFERENCES users(id),
  membership_id uuid NOT NULL REFERENCES organization_memberships(id), membership_version integer NOT NULL, user_auth_version integer NOT NULL,
  ip_hash text, user_agent_hash text, expires_at timestamp NOT NULL, revoked_at timestamp, last_seen_at timestamp NOT NULL DEFAULT now(),
  created_at timestamp NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS auth_sessions_user_idx ON auth_sessions(user_id);
CREATE INDEX IF NOT EXISTS auth_sessions_org_idx ON auth_sessions(organization_id);
CREATE INDEX IF NOT EXISTS auth_sessions_expiry_idx ON auth_sessions(expires_at);

CREATE TABLE IF NOT EXISTS audit_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), organization_id uuid REFERENCES organizations(id), actor_user_id uuid REFERENCES users(id),
  actor_type text NOT NULL DEFAULT 'user', action text NOT NULL, target_type text, target_id text, result text NOT NULL DEFAULT 'success',
  request_id text, ip_hash text, user_agent_hash text, metadata jsonb DEFAULT '{}'::jsonb, occurred_at timestamp NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS audit_events_org_time_idx ON audit_events(organization_id,occurred_at DESC);
CREATE INDEX IF NOT EXISTS audit_events_actor_time_idx ON audit_events(actor_user_id,occurred_at DESC);
CREATE INDEX IF NOT EXISTS audit_events_action_idx ON audit_events(action);

CREATE TABLE IF NOT EXISTS integration_secrets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), organization_id uuid NOT NULL REFERENCES organizations(id), provider text NOT NULL,
  ciphertext text NOT NULL, iv text NOT NULL, auth_tag text NOT NULL, key_version integer NOT NULL DEFAULT 1,
  created_at timestamp NOT NULL DEFAULT now(), rotated_at timestamp
);
CREATE INDEX IF NOT EXISTS integration_secrets_org_provider_idx ON integration_secrets(organization_id,provider);
CREATE TABLE IF NOT EXISTS connector_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), organization_id uuid NOT NULL REFERENCES organizations(id), provider text NOT NULL,
  external_account_id text, display_name text, status text NOT NULL DEFAULT 'disconnected', health_status text NOT NULL DEFAULT 'unknown',
  scopes text[] DEFAULT ARRAY[]::text[], secret_id uuid REFERENCES integration_secrets(id), last_verified_at timestamp, last_sync_at timestamp,
  last_error text, metadata jsonb DEFAULT '{}'::jsonb, created_at timestamp NOT NULL DEFAULT now(), updated_at timestamp NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS connector_accounts_org_provider_uidx ON connector_accounts(organization_id,provider);
CREATE INDEX IF NOT EXISTS connector_accounts_health_idx ON connector_accounts(health_status);

CREATE TABLE IF NOT EXISTS api_keys (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), organization_id uuid NOT NULL REFERENCES organizations(id), created_by_user_id uuid REFERENCES users(id),
  name text NOT NULL, prefix text NOT NULL, key_hash text NOT NULL UNIQUE, scopes text[] DEFAULT ARRAY[]::text[], last_used_at timestamp,
  expires_at timestamp, revoked_at timestamp, created_at timestamp NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS api_keys_org_idx ON api_keys(organization_id);

CREATE TABLE IF NOT EXISTS webhook_endpoints (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), organization_id uuid NOT NULL REFERENCES organizations(id), url text NOT NULL,
  events text[] DEFAULT ARRAY[]::text[], secret_id uuid NOT NULL REFERENCES integration_secrets(id), active boolean NOT NULL DEFAULT true,
  health_status text NOT NULL DEFAULT 'pending', consecutive_failures integer NOT NULL DEFAULT 0, last_delivery_at timestamp,
  last_success_at timestamp, last_failure_at timestamp, created_at timestamp NOT NULL DEFAULT now(), updated_at timestamp NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS webhook_endpoints_org_idx ON webhook_endpoints(organization_id);
CREATE TABLE IF NOT EXISTS webhook_deliveries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), organization_id uuid NOT NULL REFERENCES organizations(id), endpoint_id uuid NOT NULL REFERENCES webhook_endpoints(id),
  event_id uuid NOT NULL, event_type text NOT NULL, payload jsonb NOT NULL, idempotency_key text NOT NULL, status text NOT NULL DEFAULT 'pending',
  attempt_count integer NOT NULL DEFAULT 0, next_attempt_at timestamp NOT NULL DEFAULT now(), response_status integer, response_body text,
  last_error text, delivered_at timestamp, created_at timestamp NOT NULL DEFAULT now(), updated_at timestamp NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS webhook_deliveries_endpoint_event_uidx ON webhook_deliveries(endpoint_id,event_id);
CREATE INDEX IF NOT EXISTS webhook_deliveries_due_idx ON webhook_deliveries(status,next_attempt_at);

CREATE TABLE IF NOT EXISTS integration_event_receipts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), organization_id uuid NOT NULL REFERENCES organizations(id), provider text NOT NULL,
  external_event_id text NOT NULL, event_type text NOT NULL, status text NOT NULL DEFAULT 'received', error text,
  received_at timestamp NOT NULL DEFAULT now(), processed_at timestamp
);
CREATE UNIQUE INDEX IF NOT EXISTS integration_event_receipts_provider_event_uidx ON integration_event_receipts(organization_id,provider,external_event_id);
CREATE INDEX IF NOT EXISTS integration_event_receipts_org_time_idx ON integration_event_receipts(organization_id,received_at DESC);

CREATE TABLE IF NOT EXISTS api_rate_limits (
  key text PRIMARY KEY, window_start timestamp NOT NULL, count integer NOT NULL DEFAULT 0, updated_at timestamp NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS email_deliveries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), organization_id uuid NOT NULL REFERENCES organizations(id), campaign_id uuid NOT NULL REFERENCES campaigns(id),
  contact_id uuid REFERENCES contacts(id), recipient_hash text NOT NULL, provider text NOT NULL DEFAULT 'resend', provider_message_id text,
  status text NOT NULL DEFAULT 'pending', idempotency_key text NOT NULL, attempt_count integer NOT NULL DEFAULT 0, last_error text,
  accepted_at timestamp, delivered_at timestamp, failed_at timestamp, created_at timestamp NOT NULL DEFAULT now(), updated_at timestamp NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS email_deliveries_idempotency_uidx ON email_deliveries(idempotency_key);
CREATE INDEX IF NOT EXISTS email_deliveries_campaign_idx ON email_deliveries(organization_id,campaign_id,created_at DESC);
CREATE INDEX IF NOT EXISTS email_deliveries_provider_message_idx ON email_deliveries(provider,provider_message_id);
CREATE TABLE IF NOT EXISTS email_suppressions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), organization_id uuid NOT NULL REFERENCES organizations(id), recipient_hash text NOT NULL,
  channel text NOT NULL DEFAULT 'email', reason text NOT NULL DEFAULT 'unsubscribe', source text NOT NULL DEFAULT 'recipient', created_at timestamp NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS email_suppressions_org_recipient_uidx ON email_suppressions(organization_id,recipient_hash,channel);
CREATE INDEX IF NOT EXISTS email_suppressions_org_idx ON email_suppressions(organization_id,created_at DESC);
CREATE TABLE IF NOT EXISTS contact_consents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), organization_id uuid NOT NULL REFERENCES organizations(id), contact_id uuid NOT NULL REFERENCES contacts(id),
  channel text NOT NULL, purpose text NOT NULL, status text NOT NULL, lawful_basis text, source text, evidence jsonb DEFAULT '{}'::jsonb,
  effective_at timestamp NOT NULL DEFAULT now(), expires_at timestamp, recorded_by_user_id uuid REFERENCES users(id), created_at timestamp NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS contact_consents_contact_idx ON contact_consents(organization_id,contact_id);
CREATE INDEX IF NOT EXISTS contact_consents_lookup_idx ON contact_consents(organization_id,channel,purpose,effective_at DESC);
CREATE TABLE IF NOT EXISTS email_tracking_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), organization_id uuid NOT NULL REFERENCES organizations(id), campaign_id uuid NOT NULL REFERENCES campaigns(id),
  recipient_hash text NOT NULL, event_type text NOT NULL, target_hash text NOT NULL DEFAULT '', user_agent_hash text, ip_hash text,
  occurred_at timestamp NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS email_tracking_unique_event_uidx ON email_tracking_events(campaign_id,recipient_hash,event_type,target_hash);
CREATE INDEX IF NOT EXISTS email_tracking_campaign_idx ON email_tracking_events(organization_id,campaign_id,occurred_at);

-- Tenant safe composite keys for the highest risk relationships. Existing bad rows must be repaired before these constraints can be added.
CREATE UNIQUE INDEX IF NOT EXISTS contacts_org_id_uidx ON contacts(organization_id,id);
CREATE UNIQUE INDEX IF NOT EXISTS companies_org_id_uidx ON companies(organization_id,id);
CREATE UNIQUE INDEX IF NOT EXISTS deals_org_id_uidx ON deals(organization_id,id);
CREATE UNIQUE INDEX IF NOT EXISTS workflows_org_id_uidx ON workflows(organization_id,id);
CREATE UNIQUE INDEX IF NOT EXISTS products_org_id_uidx ON products(organization_id,id);

-- Legacy plaintext settings are migrated by scripts/migrate-legacy-secrets.mjs.
-- This migration remains additive and reversible; deployment must run the guarded data migration before production traffic.
