-- Tenant scoped operational telemetry. This records failures and runtime signals without storing secrets.
CREATE TABLE IF NOT EXISTS operational_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id),
  severity text NOT NULL CHECK (severity IN ('info','warning','error','critical')),
  component text NOT NULL,
  event text NOT NULL,
  request_id text,
  error_code text,
  message text NOT NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  occurred_at timestamp NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS operational_events_org_time_idx ON operational_events(organization_id,occurred_at DESC);
CREATE INDEX IF NOT EXISTS operational_events_org_severity_idx ON operational_events(organization_id,severity,occurred_at DESC);
CREATE INDEX IF NOT EXISTS operational_events_component_idx ON operational_events(component,event,occurred_at DESC);

ALTER TABLE operational_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE operational_events FORCE ROW LEVEL SECURITY;
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = current_schema()
      AND tablename = 'operational_events'
      AND policyname = 'operational_events_tenant_isolation'
  ) THEN
    CREATE POLICY operational_events_tenant_isolation ON operational_events
      USING (organization_id = nxtgen_current_tenant())
      WITH CHECK (organization_id = nxtgen_current_tenant());
  END IF;
END $$;
