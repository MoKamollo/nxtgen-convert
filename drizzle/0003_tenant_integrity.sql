-- Tenant safe relational integrity. Constraints are NOT VALID so existing production rows are preserved.
-- PostgreSQL enforces each constraint for all new and changed rows immediately.
CREATE UNIQUE INDEX IF NOT EXISTS campaigns_org_id_uidx ON campaigns(organization_id,id);
CREATE UNIQUE INDEX IF NOT EXISTS webhook_endpoints_org_id_uidx ON webhook_endpoints(organization_id,id);
CREATE UNIQUE INDEX IF NOT EXISTS organization_memberships_org_user_lookup_uidx ON organization_memberships(organization_id,user_id);

DO $$
DECLARE item record;
BEGIN
  FOR item IN SELECT * FROM (VALUES
    ('contacts','contacts_company_tenant_fk','company_id','companies'),
    ('deals','deals_contact_tenant_fk','contact_id','contacts'),
    ('deals','deals_company_tenant_fk','company_id','companies'),
    ('activities','activities_contact_tenant_fk','contact_id','contacts'),
    ('activities','activities_company_tenant_fk','company_id','companies'),
    ('activities','activities_deal_tenant_fk','deal_id','deals'),
    ('tasks','tasks_contact_tenant_fk','contact_id','contacts'),
    ('tasks','tasks_deal_tenant_fk','deal_id','deals'),
    ('tickets','tickets_contact_tenant_fk','contact_id','contacts'),
    ('orders','orders_contact_tenant_fk','contact_id','contacts'),
    ('subscriptions','subscriptions_contact_tenant_fk','contact_id','contacts'),
    ('subscriptions','subscriptions_product_tenant_fk','product_id','products'),
    ('affiliates','affiliates_contact_tenant_fk','contact_id','contacts'),
    ('analytics_events','analytics_events_contact_tenant_fk','contact_id','contacts'),
    ('nps_responses','nps_responses_contact_tenant_fk','contact_id','contacts'),
    ('automation_logs','automation_logs_contact_tenant_fk','contact_id','contacts'),
    ('automation_logs','automation_logs_workflow_tenant_fk','workflow_id','workflows'),
    ('workflow_enrollments','workflow_enrollments_workflow_tenant_fk','workflow_id','workflows'),
    ('workflow_enrollments','workflow_enrollments_contact_tenant_fk','contact_id','contacts'),
    ('workflow_enrollments','workflow_enrollments_deal_tenant_fk','deal_id','deals'),
    ('workflow_step_executions','workflow_step_executions_workflow_tenant_fk','workflow_id','workflows'),
    ('contact_consents','contact_consents_contact_tenant_fk','contact_id','contacts'),
    ('email_tracking_events','email_tracking_events_campaign_tenant_fk','campaign_id','campaigns'),
    ('email_deliveries','email_deliveries_campaign_tenant_fk','campaign_id','campaigns'),
    ('email_deliveries','email_deliveries_contact_tenant_fk','contact_id','contacts'),
    ('webhook_deliveries','webhook_deliveries_endpoint_tenant_fk','endpoint_id','webhook_endpoints')
  ) AS relations(table_name,constraint_name,column_name,reference_table)
  LOOP
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = item.constraint_name) THEN
      EXECUTE format(
        'ALTER TABLE %I ADD CONSTRAINT %I FOREIGN KEY (organization_id,%I) REFERENCES %I(organization_id,id) NOT VALID',
        item.table_name, item.constraint_name, item.column_name, item.reference_table
      );
    END IF;
  END LOOP;
END $$;

-- User references are checked against active organization membership because users are global identities.
CREATE OR REPLACE FUNCTION nxtgen_enforce_user_membership() RETURNS trigger AS $$
DECLARE candidate uuid;
BEGIN
  candidate := CASE TG_ARGV[0]
    WHEN 'owner_id' THEN NEW.owner_id
    WHEN 'user_id' THEN NEW.user_id
    WHEN 'assignee_id' THEN NEW.assignee_id
    WHEN 'created_by_id' THEN NEW.created_by_id
    WHEN 'recorded_by_user_id' THEN NEW.recorded_by_user_id
    ELSE NULL
  END;
  IF candidate IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM organization_memberships m
    WHERE m.organization_id = NEW.organization_id AND m.user_id = candidate AND m.status = 'active'
  ) THEN
    RAISE EXCEPTION 'Referenced user is not an active member of this organization' USING ERRCODE = '23503';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DO $$
DECLARE item record;
BEGIN
  FOR item IN SELECT * FROM (VALUES
    ('contacts','contacts_owner_membership_trg','owner_id'),
    ('companies','companies_owner_membership_trg','owner_id'),
    ('deals','deals_owner_membership_trg','owner_id'),
    ('activities','activities_user_membership_trg','user_id'),
    ('tasks','tasks_assignee_membership_trg','assignee_id'),
    ('email_templates','email_templates_creator_membership_trg','created_by_id'),
    ('campaigns','campaigns_creator_membership_trg','created_by_id'),
    ('workflows','workflows_creator_membership_trg','created_by_id'),
    ('tickets','tickets_assignee_membership_trg','assignee_id'),
    ('notifications','notifications_user_membership_trg','user_id'),
    ('contact_consents','contact_consents_recorder_membership_trg','recorded_by_user_id')
  ) AS refs(table_name,trigger_name,column_name)
  LOOP
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = item.trigger_name AND NOT tgisinternal) THEN
      EXECUTE format(
        'CREATE CONSTRAINT TRIGGER %I AFTER INSERT OR UPDATE OF %I,organization_id ON %I DEFERRABLE INITIALLY IMMEDIATE FOR EACH ROW EXECUTE FUNCTION nxtgen_enforce_user_membership(%L)',
        item.trigger_name, item.column_name, item.table_name, item.column_name
      );
    END IF;
  END LOOP;
END $$;
