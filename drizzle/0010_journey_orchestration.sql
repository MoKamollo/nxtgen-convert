-- Production journey orchestration: governed goals, branches, experiments, and exits.
ALTER TABLE workflow_enrollments ADD COLUMN IF NOT EXISTS exit_type text;
ALTER TABLE workflow_enrollments ADD COLUMN IF NOT EXISTS exit_reason text;
ALTER TABLE workflow_enrollments ADD COLUMN IF NOT EXISTS exited_at timestamp;
ALTER TABLE workflow_enrollments ADD COLUMN IF NOT EXISTS goal_reached_at timestamp;

CREATE UNIQUE INDEX IF NOT EXISTS workflows_org_id_uidx ON workflows(organization_id,id);
CREATE UNIQUE INDEX IF NOT EXISTS workflow_enrollments_org_id_uidx ON workflow_enrollments(organization_id,id);

CREATE TABLE IF NOT EXISTS workflow_goal_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id),
  workflow_id uuid NOT NULL REFERENCES workflows(id),
  workflow_version_id uuid REFERENCES workflow_versions(id),
  enrollment_id uuid NOT NULL REFERENCES workflow_enrollments(id),
  contact_id uuid REFERENCES contacts(id),
  deal_id uuid REFERENCES deals(id),
  goal_key text NOT NULL,
  goal_name text NOT NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  reached_at timestamp NOT NULL DEFAULT now(),
  created_at timestamp NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS workflow_goal_events_enrollment_goal_uidx ON workflow_goal_events(organization_id,enrollment_id,goal_key);
CREATE UNIQUE INDEX IF NOT EXISTS workflow_goal_events_org_id_uidx ON workflow_goal_events(organization_id,id);
CREATE INDEX IF NOT EXISTS workflow_goal_events_workflow_time_idx ON workflow_goal_events(organization_id,workflow_id,reached_at);

CREATE TABLE IF NOT EXISTS workflow_experiment_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id),
  workflow_id uuid NOT NULL REFERENCES workflows(id),
  workflow_version_id uuid REFERENCES workflow_versions(id),
  enrollment_id uuid NOT NULL REFERENCES workflow_enrollments(id),
  step_index integer NOT NULL,
  experiment_key text NOT NULL,
  variant_id text NOT NULL,
  variant_name text NOT NULL,
  target_index integer NOT NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  assigned_at timestamp NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS workflow_experiment_assignments_enrollment_step_uidx ON workflow_experiment_assignments(organization_id,enrollment_id,step_index);
CREATE UNIQUE INDEX IF NOT EXISTS workflow_experiment_assignments_org_id_uidx ON workflow_experiment_assignments(organization_id,id);
CREATE INDEX IF NOT EXISTS workflow_experiment_assignments_workflow_idx ON workflow_experiment_assignments(organization_id,workflow_id,experiment_key,variant_id);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'workflow_goal_events_workflow_tenant_fk') THEN
    ALTER TABLE workflow_goal_events ADD CONSTRAINT workflow_goal_events_workflow_tenant_fk
      FOREIGN KEY (organization_id,workflow_id) REFERENCES workflows(organization_id,id) NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'workflow_goal_events_version_tenant_fk') THEN
    ALTER TABLE workflow_goal_events ADD CONSTRAINT workflow_goal_events_version_tenant_fk
      FOREIGN KEY (organization_id,workflow_version_id) REFERENCES workflow_versions(organization_id,id) NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'workflow_goal_events_enrollment_tenant_fk') THEN
    ALTER TABLE workflow_goal_events ADD CONSTRAINT workflow_goal_events_enrollment_tenant_fk
      FOREIGN KEY (organization_id,enrollment_id) REFERENCES workflow_enrollments(organization_id,id) NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'workflow_experiment_assignments_workflow_tenant_fk') THEN
    ALTER TABLE workflow_experiment_assignments ADD CONSTRAINT workflow_experiment_assignments_workflow_tenant_fk
      FOREIGN KEY (organization_id,workflow_id) REFERENCES workflows(organization_id,id) NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'workflow_experiment_assignments_version_tenant_fk') THEN
    ALTER TABLE workflow_experiment_assignments ADD CONSTRAINT workflow_experiment_assignments_version_tenant_fk
      FOREIGN KEY (organization_id,workflow_version_id) REFERENCES workflow_versions(organization_id,id) NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'workflow_experiment_assignments_enrollment_tenant_fk') THEN
    ALTER TABLE workflow_experiment_assignments ADD CONSTRAINT workflow_experiment_assignments_enrollment_tenant_fk
      FOREIGN KEY (organization_id,enrollment_id) REFERENCES workflow_enrollments(organization_id,id) NOT VALID;
  END IF;
END $$;

DO $$
DECLARE table_name text;
DECLARE policy_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY['workflow_goal_events','workflow_experiment_assignments']
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
