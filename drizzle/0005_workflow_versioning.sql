-- Immutable workflow definitions with explicit publish and rollback.
CREATE TABLE IF NOT EXISTS workflow_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id),
  workflow_id uuid NOT NULL REFERENCES workflows(id),
  version integer NOT NULL,
  definition jsonb NOT NULL,
  checksum text NOT NULL,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','published')),
  created_by_id uuid REFERENCES users(id),
  created_at timestamp NOT NULL DEFAULT now(),
  published_at timestamp
);
CREATE UNIQUE INDEX IF NOT EXISTS workflow_versions_workflow_version_uidx ON workflow_versions(organization_id,workflow_id,version);
CREATE UNIQUE INDEX IF NOT EXISTS workflow_versions_workflow_checksum_uidx ON workflow_versions(organization_id,workflow_id,checksum);
CREATE UNIQUE INDEX IF NOT EXISTS workflow_versions_org_id_uidx ON workflow_versions(organization_id,id);
CREATE INDEX IF NOT EXISTS workflow_versions_org_status_idx ON workflow_versions(organization_id,status,created_at);

CREATE TABLE IF NOT EXISTS workflow_active_versions (
  workflow_id uuid PRIMARY KEY REFERENCES workflows(id),
  organization_id uuid NOT NULL REFERENCES organizations(id),
  version_id uuid NOT NULL REFERENCES workflow_versions(id),
  activated_by_id uuid REFERENCES users(id),
  activated_at timestamp NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS workflow_active_versions_org_workflow_uidx ON workflow_active_versions(organization_id,workflow_id);
CREATE INDEX IF NOT EXISTS workflow_active_versions_version_idx ON workflow_active_versions(version_id);

ALTER TABLE workflow_enrollments ADD COLUMN IF NOT EXISTS workflow_version_id uuid REFERENCES workflow_versions(id);

-- Preserve the currently stored definition as the first immutable version.
INSERT INTO workflow_versions (organization_id,workflow_id,version,definition,checksum,status,created_by_id,created_at,published_at)
SELECT
  w.organization_id,
  w.id,
  GREATEST(COALESCE(w.version,1),1),
  jsonb_build_object('trigger',w.trigger,'steps',COALESCE(w.steps,'[]'::jsonb)),
  encode(digest(jsonb_build_object('trigger',w.trigger,'steps',COALESCE(w.steps,'[]'::jsonb))::text,'sha256'),'hex'),
  CASE WHEN w.status = 'draft' THEN 'draft' ELSE 'published' END,
  w.created_by_id,
  w.created_at,
  CASE WHEN w.status = 'draft' THEN NULL ELSE COALESCE(w.updated_at,w.created_at,now()) END
FROM workflows w
ON CONFLICT (organization_id,workflow_id,version) DO NOTHING;

-- Active and paused workflows retain a known published runtime definition.
INSERT INTO workflow_active_versions (organization_id,workflow_id,version_id,activated_by_id,activated_at)
SELECT w.organization_id,w.id,v.id,w.created_by_id,COALESCE(v.published_at,w.updated_at,now())
FROM workflows w
JOIN workflow_versions v ON v.organization_id = w.organization_id AND v.workflow_id = w.id AND v.version = GREATEST(COALESCE(w.version,1),1)
WHERE w.status IN ('active','paused')
ON CONFLICT (workflow_id) DO UPDATE SET
  organization_id = EXCLUDED.organization_id,
  version_id = EXCLUDED.version_id,
  activated_by_id = EXCLUDED.activated_by_id,
  activated_at = EXCLUDED.activated_at;

-- Existing enrollments are pinned to the definition that was active at migration time.
UPDATE workflow_enrollments e
SET workflow_version_id = a.version_id
FROM workflow_active_versions a
WHERE e.workflow_version_id IS NULL
  AND e.organization_id = a.organization_id
  AND e.workflow_id = a.workflow_id;

-- Composite tenant integrity for all new and changed rows.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'workflow_versions_workflow_tenant_fk') THEN
    ALTER TABLE workflow_versions ADD CONSTRAINT workflow_versions_workflow_tenant_fk
      FOREIGN KEY (organization_id,workflow_id) REFERENCES workflows(organization_id,id) NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'workflow_active_versions_workflow_tenant_fk') THEN
    ALTER TABLE workflow_active_versions ADD CONSTRAINT workflow_active_versions_workflow_tenant_fk
      FOREIGN KEY (organization_id,workflow_id) REFERENCES workflows(organization_id,id) NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'workflow_active_versions_version_tenant_fk') THEN
    ALTER TABLE workflow_active_versions ADD CONSTRAINT workflow_active_versions_version_tenant_fk
      FOREIGN KEY (organization_id,version_id) REFERENCES workflow_versions(organization_id,id) NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'workflow_enrollments_version_tenant_fk') THEN
    ALTER TABLE workflow_enrollments ADD CONSTRAINT workflow_enrollments_version_tenant_fk
      FOREIGN KEY (organization_id,workflow_version_id) REFERENCES workflow_versions(organization_id,id) NOT VALID;
  END IF;
END $$;

-- Database enforced tenant isolation for version records.
DO $$
DECLARE table_name text;
DECLARE policy_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY['workflow_versions','workflow_active_versions']
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
