-- Database enforced tenant isolation for core customer and commercial tables.
CREATE OR REPLACE FUNCTION nxtgen_current_tenant() RETURNS uuid AS $$
  SELECT NULLIF(current_setting('app.tenant_id', true), '')::uuid
$$ LANGUAGE sql STABLE;

DO $$
DECLARE table_name text;
DECLARE policy_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'contacts','companies','pipelines','deals','activities','tasks','email_templates','workflows','tickets',
    'products','orders','analytics_events','revenue_metrics','notifications','marketing_spend','subscriptions','affiliates',
    'social_posts','kb_articles','website_pages','blog_posts','automation_logs','workflow_enrollments','workflow_step_executions',
    'contact_consents','email_suppressions'
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
