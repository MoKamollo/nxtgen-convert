-- Governed customer segmentation and personalization decisioning.
CREATE TABLE IF NOT EXISTS customer_segments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id),
  name text NOT NULL,
  description text,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','active','archived')),
  definition jsonb NOT NULL DEFAULT '{"combinator":"and","conditions":[]}'::jsonb,
  version integer NOT NULL DEFAULT 1,
  created_by_user_id uuid REFERENCES users(id),
  created_at timestamp NOT NULL DEFAULT now(),
  updated_at timestamp NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS customer_segments_org_name_uidx ON customer_segments(organization_id,name);
CREATE UNIQUE INDEX IF NOT EXISTS customer_segments_org_id_uidx ON customer_segments(organization_id,id);

CREATE TABLE IF NOT EXISTS customer_segment_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id),
  segment_id uuid NOT NULL REFERENCES customer_segments(id),
  version integer NOT NULL,
  definition jsonb NOT NULL,
  checksum text NOT NULL,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','published')),
  created_by_user_id uuid REFERENCES users(id),
  created_at timestamp NOT NULL DEFAULT now(),
  published_at timestamp
);
CREATE UNIQUE INDEX IF NOT EXISTS customer_segment_versions_number_uidx ON customer_segment_versions(organization_id,segment_id,version);
CREATE UNIQUE INDEX IF NOT EXISTS customer_segment_versions_checksum_uidx ON customer_segment_versions(organization_id,segment_id,checksum);
CREATE UNIQUE INDEX IF NOT EXISTS customer_segment_versions_org_id_uidx ON customer_segment_versions(organization_id,id);

CREATE TABLE IF NOT EXISTS customer_segment_active_versions (
  segment_id uuid PRIMARY KEY REFERENCES customer_segments(id),
  organization_id uuid NOT NULL REFERENCES organizations(id),
  version_id uuid NOT NULL REFERENCES customer_segment_versions(id),
  activated_by_user_id uuid REFERENCES users(id),
  activated_at timestamp NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS customer_segment_active_versions_org_segment_uidx ON customer_segment_active_versions(organization_id,segment_id);

CREATE TABLE IF NOT EXISTS personalization_experiences (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id),
  key text NOT NULL,
  name text NOT NULL,
  description text,
  channel text NOT NULL CHECK (channel IN ('website','email','offer','journey')),
  segment_id uuid REFERENCES customer_segments(id),
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','active','paused','archived')),
  definition jsonb NOT NULL,
  version integer NOT NULL DEFAULT 1,
  starts_at timestamp,
  ends_at timestamp,
  created_by_user_id uuid REFERENCES users(id),
  created_at timestamp NOT NULL DEFAULT now(),
  updated_at timestamp NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS personalization_experiences_org_key_uidx ON personalization_experiences(organization_id,key);
CREATE UNIQUE INDEX IF NOT EXISTS personalization_experiences_org_id_uidx ON personalization_experiences(organization_id,id);

CREATE TABLE IF NOT EXISTS personalization_experience_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id),
  experience_id uuid NOT NULL REFERENCES personalization_experiences(id),
  version integer NOT NULL,
  definition jsonb NOT NULL,
  checksum text NOT NULL,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','published')),
  created_by_user_id uuid REFERENCES users(id),
  created_at timestamp NOT NULL DEFAULT now(),
  published_at timestamp
);
CREATE UNIQUE INDEX IF NOT EXISTS personalization_experience_versions_number_uidx ON personalization_experience_versions(organization_id,experience_id,version);
CREATE UNIQUE INDEX IF NOT EXISTS personalization_experience_versions_checksum_uidx ON personalization_experience_versions(organization_id,experience_id,checksum);
CREATE UNIQUE INDEX IF NOT EXISTS personalization_experience_versions_org_id_uidx ON personalization_experience_versions(organization_id,id);

CREATE TABLE IF NOT EXISTS personalization_active_versions (
  experience_id uuid PRIMARY KEY REFERENCES personalization_experiences(id),
  organization_id uuid NOT NULL REFERENCES organizations(id),
  version_id uuid NOT NULL REFERENCES personalization_experience_versions(id),
  activated_by_user_id uuid REFERENCES users(id),
  activated_at timestamp NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS personalization_active_versions_org_experience_uidx ON personalization_active_versions(organization_id,experience_id);

CREATE TABLE IF NOT EXISTS personalization_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id),
  experience_id uuid NOT NULL REFERENCES personalization_experiences(id),
  experience_version_id uuid NOT NULL REFERENCES personalization_experience_versions(id),
  contact_id uuid REFERENCES contacts(id),
  subject_key_hash text NOT NULL,
  variant_id text NOT NULL,
  variant_name text NOT NULL,
  eligible boolean NOT NULL,
  eligibility_reason text NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  assigned_at timestamp NOT NULL DEFAULT now(),
  last_evaluated_at timestamp NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS personalization_assignments_subject_uidx ON personalization_assignments(organization_id,experience_id,experience_version_id,subject_key_hash);
CREATE UNIQUE INDEX IF NOT EXISTS personalization_assignments_org_id_uidx ON personalization_assignments(organization_id,id);
CREATE INDEX IF NOT EXISTS personalization_assignments_experience_idx ON personalization_assignments(organization_id,experience_id,variant_id,assigned_at);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'customer_segment_versions_segment_tenant_fk') THEN
    ALTER TABLE customer_segment_versions ADD CONSTRAINT customer_segment_versions_segment_tenant_fk FOREIGN KEY (organization_id,segment_id) REFERENCES customer_segments(organization_id,id) NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'customer_segment_active_versions_segment_tenant_fk') THEN
    ALTER TABLE customer_segment_active_versions ADD CONSTRAINT customer_segment_active_versions_segment_tenant_fk FOREIGN KEY (organization_id,segment_id) REFERENCES customer_segments(organization_id,id) NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'customer_segment_active_versions_version_tenant_fk') THEN
    ALTER TABLE customer_segment_active_versions ADD CONSTRAINT customer_segment_active_versions_version_tenant_fk FOREIGN KEY (organization_id,version_id) REFERENCES customer_segment_versions(organization_id,id) NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'personalization_experience_versions_experience_tenant_fk') THEN
    ALTER TABLE personalization_experience_versions ADD CONSTRAINT personalization_experience_versions_experience_tenant_fk FOREIGN KEY (organization_id,experience_id) REFERENCES personalization_experiences(organization_id,id) NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'personalization_active_versions_experience_tenant_fk') THEN
    ALTER TABLE personalization_active_versions ADD CONSTRAINT personalization_active_versions_experience_tenant_fk FOREIGN KEY (organization_id,experience_id) REFERENCES personalization_experiences(organization_id,id) NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'personalization_active_versions_version_tenant_fk') THEN
    ALTER TABLE personalization_active_versions ADD CONSTRAINT personalization_active_versions_version_tenant_fk FOREIGN KEY (organization_id,version_id) REFERENCES personalization_experience_versions(organization_id,id) NOT VALID;
  END IF;
END $$;

DO $$
DECLARE table_name text;
DECLARE policy_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'customer_segments','customer_segment_versions','customer_segment_active_versions',
    'personalization_experiences','personalization_experience_versions','personalization_active_versions','personalization_assignments'
  ] LOOP
    policy_name := table_name || '_tenant_isolation';
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', table_name);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', table_name);
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname=current_schema() AND tablename=table_name AND policyname=policy_name) THEN
      EXECUTE format('CREATE POLICY %I ON %I USING (organization_id = nxtgen_current_tenant()) WITH CHECK (organization_id = nxtgen_current_tenant())', policy_name, table_name);
    END IF;
  END LOOP;
END $$;
