DROP POLICY IF EXISTS operational_events_tenant_isolation ON operational_events;
ALTER TABLE IF EXISTS operational_events NO FORCE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS operational_events DISABLE ROW LEVEL SECURITY;
DROP TABLE IF EXISTS operational_events;
