-- Stage 2 release-readiness evidence. This table stores immutable, tenant-scoped
-- evidence events. It does not assert that any external validation has passed;
-- the initial state for every control remains not validated.
CREATE TABLE IF NOT EXISTS release_validation_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id),
  control_key text NOT NULL,
  action text NOT NULL CHECK (action IN ('recorded', 'revoked')),
  result text CHECK (result IN ('passed', 'failed', 'blocked')),
  environment text NOT NULL,
  summary text NOT NULL,
  evidence_reference text,
  evidence jsonb NOT NULL DEFAULT '{}'::jsonb,
  target_event_id uuid REFERENCES release_validation_events(id),
  idempotency_key text NOT NULL,
  expires_at timestamp,
  created_by_user_id uuid REFERENCES users(id),
  occurred_at timestamp NOT NULL DEFAULT now(),
  CONSTRAINT release_validation_events_org_id_unique UNIQUE (organization_id, id),
  CONSTRAINT release_validation_target_tenant_fk FOREIGN KEY (organization_id, target_event_id)
    REFERENCES release_validation_events(organization_id, id),
  CONSTRAINT release_validation_record_shape CHECK (
    (action = 'recorded' AND result IS NOT NULL AND evidence_reference IS NOT NULL AND target_event_id IS NULL)
    OR
    (action = 'revoked' AND result IS NULL AND target_event_id IS NOT NULL)
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS release_validation_events_org_idempotency_uidx
  ON release_validation_events (organization_id, idempotency_key);
CREATE INDEX IF NOT EXISTS release_validation_events_control_idx
  ON release_validation_events (organization_id, control_key, occurred_at DESC);

CREATE OR REPLACE FUNCTION nxtgen_release_validation_events_immutable()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'release validation evidence is append-only';
END;
$$;

DROP TRIGGER IF EXISTS release_validation_events_immutable ON release_validation_events;
CREATE TRIGGER release_validation_events_immutable
BEFORE UPDATE OR DELETE ON release_validation_events
FOR EACH ROW EXECUTE FUNCTION nxtgen_release_validation_events_immutable();

ALTER TABLE release_validation_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE release_validation_events FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS release_validation_events_tenant_isolation ON release_validation_events;
CREATE POLICY release_validation_events_tenant_isolation ON release_validation_events
  USING (organization_id = nxtgen_current_tenant())
  WITH CHECK (organization_id = nxtgen_current_tenant());
