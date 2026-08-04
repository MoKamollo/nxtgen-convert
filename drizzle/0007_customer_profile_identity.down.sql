DO $$
DECLARE table_name text;
DECLARE policy_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'customer_timeline_events','contact_lifecycle_history','contact_relationships',
    'identity_resolution_candidates','contact_identity_keys'
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
DROP TABLE IF EXISTS customer_timeline_events;
DROP TABLE IF EXISTS contact_lifecycle_history;
DROP TABLE IF EXISTS contact_relationships;
DROP TABLE IF EXISTS identity_resolution_candidates;
DROP TABLE IF EXISTS contact_identity_keys;

DROP INDEX IF EXISTS contacts_org_archived_idx;
ALTER TABLE contacts DROP COLUMN IF EXISTS deletion_reason;
ALTER TABLE contacts DROP COLUMN IF EXISTS archived_by_user_id;
ALTER TABLE contacts DROP COLUMN IF EXISTS archived_at;
