-- Customer Success operating model with versioned playbooks, plans, renewals, evidence based health, and risk alerts.
CREATE TABLE IF NOT EXISTS customer_success_playbooks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id),
  name text NOT NULL,
  description text,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','active','paused','archived')),
  active_version_id uuid,
  created_by_user_id uuid REFERENCES users(id),
  created_at timestamp NOT NULL DEFAULT now(),
  updated_at timestamp NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS customer_success_playbooks_org_id_uidx ON customer_success_playbooks(organization_id,id);
CREATE INDEX IF NOT EXISTS customer_success_playbooks_org_status_idx ON customer_success_playbooks(organization_id,status,updated_at DESC);

CREATE TABLE IF NOT EXISTS customer_success_playbook_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id),
  playbook_id uuid NOT NULL REFERENCES customer_success_playbooks(id),
  version integer NOT NULL,
  definition jsonb NOT NULL,
  checksum text NOT NULL,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','published')),
  created_by_user_id uuid REFERENCES users(id),
  created_at timestamp NOT NULL DEFAULT now(),
  published_at timestamp
);
CREATE UNIQUE INDEX IF NOT EXISTS customer_success_playbook_versions_number_uidx ON customer_success_playbook_versions(organization_id,playbook_id,version);
CREATE UNIQUE INDEX IF NOT EXISTS customer_success_playbook_versions_checksum_uidx ON customer_success_playbook_versions(organization_id,playbook_id,checksum);
CREATE UNIQUE INDEX IF NOT EXISTS customer_success_playbook_versions_org_id_uidx ON customer_success_playbook_versions(organization_id,id);
ALTER TABLE customer_success_playbooks
  ADD CONSTRAINT customer_success_playbooks_active_version_fk
  FOREIGN KEY (active_version_id) REFERENCES customer_success_playbook_versions(id) NOT VALID;

CREATE TABLE IF NOT EXISTS customer_success_plans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id),
  contact_id uuid NOT NULL REFERENCES contacts(id),
  name text NOT NULL,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('draft','active','on_hold','completed','cancelled')),
  playbook_version_id uuid REFERENCES customer_success_playbook_versions(id),
  owner_user_id uuid REFERENCES users(id),
  objectives jsonb NOT NULL DEFAULT '[]'::jsonb,
  success_criteria jsonb NOT NULL DEFAULT '[]'::jsonb,
  start_date timestamp,
  target_date timestamp,
  completed_at timestamp,
  created_by_user_id uuid REFERENCES users(id),
  created_at timestamp NOT NULL DEFAULT now(),
  updated_at timestamp NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS customer_success_plans_org_id_uidx ON customer_success_plans(organization_id,id);
CREATE INDEX IF NOT EXISTS customer_success_plans_contact_idx ON customer_success_plans(organization_id,contact_id,status,updated_at DESC);
CREATE INDEX IF NOT EXISTS customer_success_plans_owner_idx ON customer_success_plans(organization_id,owner_user_id,status);

CREATE TABLE IF NOT EXISTS customer_success_milestones (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id),
  plan_id uuid NOT NULL REFERENCES customer_success_plans(id),
  title text NOT NULL,
  description text,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','in_progress','completed','blocked','cancelled')),
  sequence integer NOT NULL DEFAULT 0,
  due_at timestamp,
  completed_at timestamp,
  owner_user_id uuid REFERENCES users(id),
  evidence jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamp NOT NULL DEFAULT now(),
  updated_at timestamp NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS customer_success_milestones_org_id_uidx ON customer_success_milestones(organization_id,id);
CREATE INDEX IF NOT EXISTS customer_success_milestones_plan_idx ON customer_success_milestones(organization_id,plan_id,sequence);
CREATE INDEX IF NOT EXISTS customer_success_milestones_due_idx ON customer_success_milestones(organization_id,status,due_at);

CREATE TABLE IF NOT EXISTS customer_renewals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id),
  contact_id uuid NOT NULL REFERENCES contacts(id),
  subscription_id uuid REFERENCES subscriptions(id),
  renewal_date timestamp NOT NULL,
  amount numeric(15,2),
  currency text NOT NULL DEFAULT 'USD',
  status text NOT NULL DEFAULT 'upcoming' CHECK (status IN ('upcoming','in_review','renewed','churned','cancelled')),
  risk_level text NOT NULL DEFAULT 'unknown' CHECK (risk_level IN ('unknown','low','medium','high','critical')),
  owner_user_id uuid REFERENCES users(id),
  notes text,
  renewed_at timestamp,
  created_at timestamp NOT NULL DEFAULT now(),
  updated_at timestamp NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS customer_renewals_due_idx ON customer_renewals(organization_id,status,renewal_date);
CREATE INDEX IF NOT EXISTS customer_renewals_contact_idx ON customer_renewals(organization_id,contact_id,renewal_date DESC);

CREATE TABLE IF NOT EXISTS customer_health_assessments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id),
  contact_id uuid NOT NULL REFERENCES contacts(id),
  score numeric(5,2),
  status text NOT NULL CHECK (status IN ('healthy','watch','at_risk','insufficient_data')),
  components jsonb NOT NULL DEFAULT '{}'::jsonb,
  methodology_version text NOT NULL,
  evidence_from timestamp,
  evidence_to timestamp NOT NULL,
  calculated_by text NOT NULL DEFAULT 'rules_engine',
  created_at timestamp NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS customer_health_assessments_contact_idx ON customer_health_assessments(organization_id,contact_id,created_at DESC);
CREATE INDEX IF NOT EXISTS customer_health_assessments_status_idx ON customer_health_assessments(organization_id,status,created_at DESC);

CREATE TABLE IF NOT EXISTS customer_risk_alerts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id),
  contact_id uuid NOT NULL REFERENCES contacts(id),
  health_assessment_id uuid REFERENCES customer_health_assessments(id),
  alert_type text NOT NULL,
  severity text NOT NULL CHECK (severity IN ('low','medium','high','critical')),
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open','acknowledged','resolved','dismissed')),
  title text NOT NULL,
  description text,
  evidence jsonb NOT NULL DEFAULT '{}'::jsonb,
  owner_user_id uuid REFERENCES users(id),
  acknowledged_at timestamp,
  resolved_at timestamp,
  created_at timestamp NOT NULL DEFAULT now(),
  updated_at timestamp NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS customer_risk_alerts_assessment_type_uidx ON customer_risk_alerts(organization_id,health_assessment_id,alert_type);
CREATE INDEX IF NOT EXISTS customer_risk_alerts_open_idx ON customer_risk_alerts(organization_id,status,severity,created_at DESC);

DO $$
DECLARE table_name text;
DECLARE policy_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'customer_success_playbooks','customer_success_playbook_versions','customer_success_plans',
    'customer_success_milestones','customer_renewals','customer_health_assessments','customer_risk_alerts'
  ]
  LOOP
    policy_name := table_name || '_tenant_isolation';
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', table_name);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', table_name);
    IF NOT EXISTS (
      SELECT 1 FROM pg_policies WHERE schemaname=current_schema() AND tablename=table_name AND policyname=policy_name
    ) THEN
      EXECUTE format(
        'CREATE POLICY %I ON %I USING (organization_id = nxtgen_current_tenant()) WITH CHECK (organization_id = nxtgen_current_tenant())',
        policy_name, table_name
      );
    END IF;
  END LOOP;
END $$;
