DO $$
DECLARE item record;
BEGIN
  FOR item IN SELECT * FROM (VALUES
    ('contacts','contacts_company_tenant_fk'),('deals','deals_contact_tenant_fk'),('deals','deals_company_tenant_fk'),
    ('activities','activities_contact_tenant_fk'),('activities','activities_company_tenant_fk'),('activities','activities_deal_tenant_fk'),
    ('tasks','tasks_contact_tenant_fk'),('tasks','tasks_deal_tenant_fk'),('tickets','tickets_contact_tenant_fk'),('orders','orders_contact_tenant_fk'),
    ('subscriptions','subscriptions_contact_tenant_fk'),('subscriptions','subscriptions_product_tenant_fk'),('affiliates','affiliates_contact_tenant_fk'),
    ('analytics_events','analytics_events_contact_tenant_fk'),('nps_responses','nps_responses_contact_tenant_fk'),
    ('automation_logs','automation_logs_contact_tenant_fk'),('automation_logs','automation_logs_workflow_tenant_fk'),
    ('workflow_enrollments','workflow_enrollments_workflow_tenant_fk'),('workflow_enrollments','workflow_enrollments_contact_tenant_fk'),
    ('workflow_enrollments','workflow_enrollments_deal_tenant_fk'),('workflow_step_executions','workflow_step_executions_workflow_tenant_fk'),
    ('contact_consents','contact_consents_contact_tenant_fk'),('email_tracking_events','email_tracking_events_campaign_tenant_fk'),
    ('email_deliveries','email_deliveries_campaign_tenant_fk'),('email_deliveries','email_deliveries_contact_tenant_fk'),
    ('webhook_deliveries','webhook_deliveries_endpoint_tenant_fk')
  ) AS relations(table_name,constraint_name)
  LOOP EXECUTE format('ALTER TABLE %I DROP CONSTRAINT IF EXISTS %I', item.table_name, item.constraint_name); END LOOP;
END $$;

DROP TRIGGER IF EXISTS contacts_owner_membership_trg ON contacts;
DROP TRIGGER IF EXISTS companies_owner_membership_trg ON companies;
DROP TRIGGER IF EXISTS deals_owner_membership_trg ON deals;
DROP TRIGGER IF EXISTS activities_user_membership_trg ON activities;
DROP TRIGGER IF EXISTS tasks_assignee_membership_trg ON tasks;
DROP TRIGGER IF EXISTS email_templates_creator_membership_trg ON email_templates;
DROP TRIGGER IF EXISTS campaigns_creator_membership_trg ON campaigns;
DROP TRIGGER IF EXISTS workflows_creator_membership_trg ON workflows;
DROP TRIGGER IF EXISTS tickets_assignee_membership_trg ON tickets;
DROP TRIGGER IF EXISTS notifications_user_membership_trg ON notifications;
DROP TRIGGER IF EXISTS contact_consents_recorder_membership_trg ON contact_consents;
DROP FUNCTION IF EXISTS nxtgen_enforce_user_membership();
DROP INDEX IF EXISTS campaigns_org_id_uidx, webhook_endpoints_org_id_uidx, organization_memberships_org_user_lookup_uidx;
