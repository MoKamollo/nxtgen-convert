-- Destructive rollback for a brand-new baseline only. Do not run against a database containing customer data.
DROP TABLE IF EXISTS workflow_enrollments, automation_logs, blog_posts, website_pages, kb_articles, social_posts,
  marketing_forms, affiliates, subscriptions, nps_responses, marketing_spend, notifications, revenue_metrics,
  analytics_events, orders, products, tickets, workflows, campaigns, email_templates, tasks, activities,
  deals, contacts, pipeline_stages, pipelines, companies, users, organizations CASCADE;
DROP TYPE IF EXISTS subscription_plan, user_role, ticket_priority, ticket_status, workflow_status, task_priority,
  task_status, campaign_type, campaign_status, activity_type, deal_stage, contact_status;
