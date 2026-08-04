-- Unified customer profile foundation: identity keys, duplicate review, relationships, lifecycle history, and custom timeline events.
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS archived_at timestamp;
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS archived_by_user_id uuid REFERENCES users(id);
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS deletion_reason text;
CREATE INDEX IF NOT EXISTS contacts_org_archived_idx ON contacts(organization_id,archived_at);

CREATE TABLE IF NOT EXISTS contact_identity_keys (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id),
  contact_id uuid NOT NULL REFERENCES contacts(id),
  identity_type text NOT NULL CHECK (identity_type IN ('email','phone','external_id')),
  value_hash text NOT NULL,
  display_hint text,
  source text NOT NULL DEFAULT 'manual',
  verified boolean NOT NULL DEFAULT false,
  active boolean NOT NULL DEFAULT true,
  first_seen_at timestamp NOT NULL DEFAULT now(),
  last_seen_at timestamp NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS contact_identity_keys_org_type_hash_uidx
  ON contact_identity_keys(organization_id,identity_type,value_hash);
CREATE INDEX IF NOT EXISTS contact_identity_keys_contact_idx
  ON contact_identity_keys(organization_id,contact_id,active);

CREATE TABLE IF NOT EXISTS identity_resolution_candidates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id),
  left_contact_id uuid NOT NULL REFERENCES contacts(id),
  right_contact_id uuid NOT NULL REFERENCES contacts(id),
  identity_type text NOT NULL,
  identity_hash text NOT NULL,
  reason text NOT NULL,
  confidence numeric(5,2) NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','confirmed_match','rejected','resolved')),
  evidence jsonb NOT NULL DEFAULT '{}'::jsonb,
  reviewed_by_user_id uuid REFERENCES users(id),
  reviewed_at timestamp,
  created_at timestamp NOT NULL DEFAULT now(),
  updated_at timestamp NOT NULL DEFAULT now(),
  CHECK (left_contact_id <> right_contact_id)
);
CREATE UNIQUE INDEX IF NOT EXISTS identity_resolution_candidates_pair_uidx
  ON identity_resolution_candidates(organization_id,left_contact_id,right_contact_id,identity_type,identity_hash);
CREATE INDEX IF NOT EXISTS identity_resolution_candidates_org_status_idx
  ON identity_resolution_candidates(organization_id,status,created_at DESC);

CREATE TABLE IF NOT EXISTS contact_relationships (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id),
  from_contact_id uuid NOT NULL REFERENCES contacts(id),
  to_contact_id uuid NOT NULL REFERENCES contacts(id),
  relationship_type text NOT NULL,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','inactive')),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  valid_from timestamp,
  valid_until timestamp,
  created_by_user_id uuid REFERENCES users(id),
  created_at timestamp NOT NULL DEFAULT now(),
  updated_at timestamp NOT NULL DEFAULT now(),
  CHECK (from_contact_id <> to_contact_id)
);
CREATE UNIQUE INDEX IF NOT EXISTS contact_relationships_unique_edge_uidx
  ON contact_relationships(organization_id,from_contact_id,to_contact_id,relationship_type);
CREATE INDEX IF NOT EXISTS contact_relationships_from_idx
  ON contact_relationships(organization_id,from_contact_id,status);
CREATE INDEX IF NOT EXISTS contact_relationships_to_idx
  ON contact_relationships(organization_id,to_contact_id,status);

CREATE TABLE IF NOT EXISTS contact_lifecycle_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id),
  contact_id uuid NOT NULL REFERENCES contacts(id),
  from_stage text,
  to_stage text NOT NULL,
  reason text,
  source text NOT NULL DEFAULT 'manual',
  actor_user_id uuid REFERENCES users(id),
  occurred_at timestamp NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS contact_lifecycle_history_contact_idx
  ON contact_lifecycle_history(organization_id,contact_id,occurred_at DESC);

CREATE TABLE IF NOT EXISTS customer_timeline_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id),
  contact_id uuid NOT NULL REFERENCES contacts(id),
  source_type text NOT NULL,
  source_id text,
  event_type text NOT NULL,
  summary text NOT NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  actor_user_id uuid REFERENCES users(id),
  idempotency_key text NOT NULL,
  occurred_at timestamp NOT NULL DEFAULT now(),
  created_at timestamp NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS customer_timeline_events_idempotency_uidx
  ON customer_timeline_events(organization_id,idempotency_key);
CREATE INDEX IF NOT EXISTS customer_timeline_events_contact_idx
  ON customer_timeline_events(organization_id,contact_id,occurred_at DESC);

DO $$
DECLARE table_name text;
DECLARE policy_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'contact_identity_keys','identity_resolution_candidates','contact_relationships',
    'contact_lifecycle_history','customer_timeline_events'
  ]
  LOOP
    policy_name := table_name || '_tenant_isolation';
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', table_name);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', table_name);
    IF NOT EXISTS (
      SELECT 1 FROM pg_policies WHERE schemaname = current_schema() AND tablename = table_name AND policyname = policy_name
    ) THEN
      EXECUTE format(
        'CREATE POLICY %I ON %I USING (organization_id = nxtgen_current_tenant()) WITH CHECK (organization_id = nxtgen_current_tenant())',
        policy_name, table_name
      );
    END IF;
  END LOOP;
END $$;
