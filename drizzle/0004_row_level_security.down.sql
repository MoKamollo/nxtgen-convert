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
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I', policy_name, table_name);
    EXECUTE format('ALTER TABLE %I NO FORCE ROW LEVEL SECURITY', table_name);
    EXECUTE format('ALTER TABLE %I DISABLE ROW LEVEL SECURITY', table_name);
  END LOOP;
END $$;
DROP FUNCTION IF EXISTS nxtgen_current_tenant();
