-- Run read-only mismatch checks first. Every count must be zero before VALIDATE CONSTRAINT.
SELECT 'deals.contact' AS relationship, count(*) AS violations FROM deals d JOIN contacts c ON c.id=d.contact_id WHERE d.contact_id IS NOT NULL AND d.organization_id<>c.organization_id
UNION ALL SELECT 'deals.company', count(*) FROM deals d JOIN companies c ON c.id=d.company_id WHERE d.company_id IS NOT NULL AND d.organization_id<>c.organization_id
UNION ALL SELECT 'activities.contact', count(*) FROM activities a JOIN contacts c ON c.id=a.contact_id WHERE a.contact_id IS NOT NULL AND a.organization_id<>c.organization_id
UNION ALL SELECT 'activities.company', count(*) FROM activities a JOIN companies c ON c.id=a.company_id WHERE a.company_id IS NOT NULL AND a.organization_id<>c.organization_id
UNION ALL SELECT 'activities.deal', count(*) FROM activities a JOIN deals d ON d.id=a.deal_id WHERE a.deal_id IS NOT NULL AND a.organization_id<>d.organization_id
UNION ALL SELECT 'tasks.contact', count(*) FROM tasks t JOIN contacts c ON c.id=t.contact_id WHERE t.contact_id IS NOT NULL AND t.organization_id<>c.organization_id
UNION ALL SELECT 'tasks.deal', count(*) FROM tasks t JOIN deals d ON d.id=t.deal_id WHERE t.deal_id IS NOT NULL AND t.organization_id<>d.organization_id
UNION ALL SELECT 'subscriptions.contact', count(*) FROM subscriptions s JOIN contacts c ON c.id=s.contact_id WHERE s.contact_id IS NOT NULL AND s.organization_id<>c.organization_id
UNION ALL SELECT 'subscriptions.product', count(*) FROM subscriptions s JOIN products p ON p.id=s.product_id WHERE s.product_id IS NOT NULL AND s.organization_id<>p.organization_id
UNION ALL SELECT 'workflow_enrollments.contact', count(*) FROM workflow_enrollments e JOIN contacts c ON c.id=e.contact_id WHERE e.contact_id IS NOT NULL AND e.organization_id<>c.organization_id
UNION ALL SELECT 'workflow_enrollments.deal', count(*) FROM workflow_enrollments e JOIN deals d ON d.id=e.deal_id WHERE e.deal_id IS NOT NULL AND e.organization_id<>d.organization_id
UNION ALL SELECT 'workflow_enrollments.workflow', count(*) FROM workflow_enrollments e JOIN workflows w ON w.id=e.workflow_id WHERE e.organization_id<>w.organization_id;

-- Validate only after the report above and the complete relationship audit are clean.
-- ALTER TABLE deals VALIDATE CONSTRAINT deals_contact_tenant_fk;
-- ALTER TABLE deals VALIDATE CONSTRAINT deals_company_tenant_fk;
-- Continue for each constraint from drizzle/0003_tenant_integrity.sql.
