ALTER TABLE workflow_enrollments DROP CONSTRAINT IF EXISTS workflow_enrollments_version_tenant_fk;
ALTER TABLE workflow_active_versions DROP CONSTRAINT IF EXISTS workflow_active_versions_version_tenant_fk;
ALTER TABLE workflow_active_versions DROP CONSTRAINT IF EXISTS workflow_active_versions_workflow_tenant_fk;
ALTER TABLE workflow_versions DROP CONSTRAINT IF EXISTS workflow_versions_workflow_tenant_fk;

DO $$
DECLARE table_name text;
DECLARE policy_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY['workflow_versions','workflow_active_versions']
  LOOP
    policy_name := table_name || '_tenant_isolation';
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I', policy_name, table_name);
    EXECUTE format('ALTER TABLE %I NO FORCE ROW LEVEL SECURITY', table_name);
    EXECUTE format('ALTER TABLE %I DISABLE ROW LEVEL SECURITY', table_name);
  END LOOP;
END $$;

ALTER TABLE workflow_enrollments DROP COLUMN IF EXISTS workflow_version_id;
DROP TABLE IF EXISTS workflow_active_versions;
DROP TABLE IF EXISTS workflow_versions;
