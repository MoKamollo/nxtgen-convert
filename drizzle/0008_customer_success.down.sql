DO $$
DECLARE table_name text;
DECLARE policy_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'customer_risk_alerts','customer_health_assessments','customer_renewals','customer_success_milestones',
    'customer_success_plans','customer_success_playbook_versions','customer_success_playbooks'
  ]
  LOOP
    policy_name := table_name || '_tenant_isolation';
    IF to_regclass(table_name) IS NOT NULL THEN
      EXECUTE format('DROP POLICY IF EXISTS %I ON %I', policy_name, table_name);
      EXECUTE format('ALTER TABLE %I NO FORCE ROW LEVEL SECURITY', table_name);
      EXECUTE format('ALTER TABLE %I DISABLE ROW LEVEL SECURITY', table_name);
    END IF;
  END LOOP;
END $$;
DROP TABLE IF EXISTS customer_risk_alerts;
DROP TABLE IF EXISTS customer_health_assessments;
DROP TABLE IF EXISTS customer_renewals;
DROP TABLE IF EXISTS customer_success_milestones;
DROP TABLE IF EXISTS customer_success_plans;
ALTER TABLE IF EXISTS customer_success_playbooks DROP CONSTRAINT IF EXISTS customer_success_playbooks_active_version_fk;
DROP TABLE IF EXISTS customer_success_playbook_versions;
DROP TABLE IF EXISTS customer_success_playbooks;
