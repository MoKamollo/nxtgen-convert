-- NxtGen Convert reproducible baseline.
-- Safe on an empty database and idempotent against an existing installation.
CREATE EXTENSION IF NOT EXISTS pgcrypto;

DO $$ BEGIN CREATE TYPE contact_status AS ENUM ('lead','prospect','customer','churned','vip'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE deal_stage AS ENUM ('prospecting','qualification','proposal','negotiation','closed_won','closed_lost'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE activity_type AS ENUM ('call','email','meeting','note','task','sms','whatsapp'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE campaign_status AS ENUM ('draft','scheduled','sending','sent','paused','cancelled'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE campaign_type AS ENUM ('email','sms','push','whatsapp','social'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE task_status AS ENUM ('todo','in_progress','completed','cancelled'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE task_priority AS ENUM ('low','medium','high','urgent'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE workflow_status AS ENUM ('draft','active','paused','archived'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE ticket_status AS ENUM ('open','in_progress','waiting','resolved','closed'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE ticket_priority AS ENUM ('low','medium','high','critical'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE user_role AS ENUM ('owner','admin','manager','member','viewer'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE subscription_plan AS ENUM ('starter','professional','enterprise','unlimited'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS organizations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), name text NOT NULL, slug text NOT NULL UNIQUE,
  logo text, website text, industry text, size text, plan subscription_plan DEFAULT 'starter',
  settings jsonb DEFAULT '{}'::jsonb, created_at timestamp DEFAULT now() NOT NULL, updated_at timestamp DEFAULT now() NOT NULL
);
CREATE TABLE IF NOT EXISTS users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), organization_id uuid REFERENCES organizations(id),
  email text NOT NULL, name text NOT NULL, avatar text, role user_role DEFAULT 'member', job_title text,
  phone text, timezone text DEFAULT 'America/New_York', preferences jsonb DEFAULT '{}'::jsonb,
  last_active_at timestamp, created_at timestamp DEFAULT now() NOT NULL, updated_at timestamp DEFAULT now() NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS users_email_unique ON users (email);
CREATE TABLE IF NOT EXISTS companies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), organization_id uuid NOT NULL REFERENCES organizations(id), name text NOT NULL,
  domain text, logo text, industry text, size text, revenue numeric(15,2), website text, phone text,
  address jsonb DEFAULT '{}'::jsonb, tags text[] DEFAULT ARRAY[]::text[], owner_id uuid REFERENCES users(id),
  custom_fields jsonb DEFAULT '{}'::jsonb, created_at timestamp DEFAULT now() NOT NULL, updated_at timestamp DEFAULT now() NOT NULL
);
CREATE TABLE IF NOT EXISTS pipelines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), organization_id uuid NOT NULL REFERENCES organizations(id), name text NOT NULL,
  description text, currency text DEFAULT 'USD', is_default boolean DEFAULT false,
  created_at timestamp DEFAULT now() NOT NULL, updated_at timestamp DEFAULT now() NOT NULL
);
CREATE TABLE IF NOT EXISTS pipeline_stages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), pipeline_id uuid NOT NULL REFERENCES pipelines(id), name text NOT NULL,
  "order" integer NOT NULL, probability integer DEFAULT 0, color text DEFAULT '#6366f1', created_at timestamp DEFAULT now() NOT NULL
);
CREATE TABLE IF NOT EXISTS contacts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), organization_id uuid NOT NULL REFERENCES organizations(id), first_name text NOT NULL,
  last_name text, email text, phone text, mobile text, avatar text, status contact_status DEFAULT 'lead', source text,
  company_id uuid REFERENCES companies(id), job_title text, department text, website text, linked_in text, twitter text,
  address jsonb DEFAULT '{}'::jsonb, tags text[] DEFAULT ARRAY[]::text[], score integer DEFAULT 0,
  owner_id uuid REFERENCES users(id), custom_fields jsonb DEFAULT '{}'::jsonb, last_contacted_at timestamp,
  created_at timestamp DEFAULT now() NOT NULL, updated_at timestamp DEFAULT now() NOT NULL
);
CREATE TABLE IF NOT EXISTS deals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), organization_id uuid NOT NULL REFERENCES organizations(id), pipeline_id uuid REFERENCES pipelines(id),
  stage_id uuid REFERENCES pipeline_stages(id), name text NOT NULL, value numeric(15,2) DEFAULT 0, currency text DEFAULT 'USD',
  stage deal_stage DEFAULT 'prospecting', probability integer DEFAULT 0, expected_close_date timestamp,
  contact_id uuid REFERENCES contacts(id), company_id uuid REFERENCES companies(id), owner_id uuid REFERENCES users(id),
  tags text[] DEFAULT ARRAY[]::text[], custom_fields jsonb DEFAULT '{}'::jsonb, notes text, lost_reason text,
  won_at timestamp, lost_at timestamp, created_at timestamp DEFAULT now() NOT NULL, updated_at timestamp DEFAULT now() NOT NULL
);
CREATE TABLE IF NOT EXISTS activities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), organization_id uuid NOT NULL REFERENCES organizations(id), type activity_type NOT NULL,
  subject text NOT NULL, body text, contact_id uuid REFERENCES contacts(id), company_id uuid REFERENCES companies(id), deal_id uuid REFERENCES deals(id),
  user_id uuid REFERENCES users(id), scheduled_at timestamp, completed_at timestamp, duration integer, outcome text,
  metadata jsonb DEFAULT '{}'::jsonb, created_at timestamp DEFAULT now() NOT NULL
);
CREATE TABLE IF NOT EXISTS tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), organization_id uuid NOT NULL REFERENCES organizations(id), title text NOT NULL,
  description text, status task_status DEFAULT 'todo', priority task_priority DEFAULT 'medium', assignee_id uuid REFERENCES users(id),
  contact_id uuid REFERENCES contacts(id), deal_id uuid REFERENCES deals(id), due_date timestamp, completed_at timestamp,
  tags text[] DEFAULT ARRAY[]::text[], created_at timestamp DEFAULT now() NOT NULL, updated_at timestamp DEFAULT now() NOT NULL
);
CREATE TABLE IF NOT EXISTS email_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), organization_id uuid NOT NULL REFERENCES organizations(id), name text NOT NULL,
  subject text NOT NULL, preheader text, html_content text, json_content jsonb, category text, tags text[] DEFAULT ARRAY[]::text[],
  thumbnail text, is_public boolean DEFAULT false, created_by_id uuid REFERENCES users(id),
  created_at timestamp DEFAULT now() NOT NULL, updated_at timestamp DEFAULT now() NOT NULL
);
CREATE TABLE IF NOT EXISTS campaigns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), organization_id uuid NOT NULL REFERENCES organizations(id), name text NOT NULL,
  type campaign_type DEFAULT 'email', status campaign_status DEFAULT 'draft', subject text, preheader text, from_name text,
  from_email text, reply_to text, template_id uuid REFERENCES email_templates(id), content jsonb, audience_filters jsonb DEFAULT '{}'::jsonb,
  scheduled_at timestamp, sent_at timestamp, stats jsonb DEFAULT '{"sent":0,"delivered":0,"opened":0,"clicked":0,"bounced":0,"unsubscribed":0,"revenue":0}'::jsonb,
  settings jsonb DEFAULT '{}'::jsonb, created_by_id uuid REFERENCES users(id), created_at timestamp DEFAULT now() NOT NULL, updated_at timestamp DEFAULT now() NOT NULL
);
CREATE TABLE IF NOT EXISTS workflows (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), organization_id uuid NOT NULL REFERENCES organizations(id), name text NOT NULL,
  description text, status workflow_status DEFAULT 'draft', trigger jsonb NOT NULL, steps jsonb DEFAULT '[]'::jsonb,
  enrolled_count integer DEFAULT 0, completed_count integer DEFAULT 0, conversion_rate numeric(5,2) DEFAULT 0,
  tags text[] DEFAULT ARRAY[]::text[], version integer DEFAULT 1, created_by_id uuid REFERENCES users(id),
  created_at timestamp DEFAULT now() NOT NULL, updated_at timestamp DEFAULT now() NOT NULL
);
CREATE TABLE IF NOT EXISTS tickets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), organization_id uuid NOT NULL REFERENCES organizations(id), ticket_number text NOT NULL,
  subject text NOT NULL, description text, status ticket_status DEFAULT 'open', priority ticket_priority DEFAULT 'medium',
  contact_id uuid REFERENCES contacts(id), assignee_id uuid REFERENCES users(id), tags text[] DEFAULT ARRAY[]::text[], source text,
  resolved_at timestamp, first_response_at timestamp, satisfaction_score integer, custom_fields jsonb DEFAULT '{}'::jsonb,
  created_at timestamp DEFAULT now() NOT NULL, updated_at timestamp DEFAULT now() NOT NULL
);
CREATE TABLE IF NOT EXISTS products (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), organization_id uuid NOT NULL REFERENCES organizations(id), name text NOT NULL,
  description text, sku text, type text DEFAULT 'digital', price numeric(15,2) NOT NULL, currency text DEFAULT 'USD',
  recurring boolean DEFAULT false, interval text, trial_days integer, inventory integer, unlimited boolean DEFAULT true,
  images text[] DEFAULT ARRAY[]::text[], tags text[] DEFAULT ARRAY[]::text[], metadata jsonb DEFAULT '{}'::jsonb,
  is_active boolean DEFAULT true, created_at timestamp DEFAULT now() NOT NULL, updated_at timestamp DEFAULT now() NOT NULL
);
CREATE TABLE IF NOT EXISTS orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), organization_id uuid NOT NULL REFERENCES organizations(id), order_number text NOT NULL,
  contact_id uuid REFERENCES contacts(id), status text DEFAULT 'pending', subtotal numeric(15,2) DEFAULT 0, tax numeric(15,2) DEFAULT 0,
  discount numeric(15,2) DEFAULT 0, total numeric(15,2) DEFAULT 0, currency text DEFAULT 'USD', items jsonb DEFAULT '[]'::jsonb,
  payment_method text, payment_status text DEFAULT 'pending', notes text, metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamp DEFAULT now() NOT NULL, updated_at timestamp DEFAULT now() NOT NULL
);
CREATE TABLE IF NOT EXISTS analytics_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), organization_id uuid NOT NULL REFERENCES organizations(id), event text NOT NULL,
  properties jsonb DEFAULT '{}'::jsonb, contact_id uuid REFERENCES contacts(id), session_id text, source text, medium text,
  campaign text, revenue numeric(15,2), created_at timestamp DEFAULT now() NOT NULL
);
CREATE TABLE IF NOT EXISTS revenue_metrics (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), organization_id uuid NOT NULL REFERENCES organizations(id), date timestamp NOT NULL,
  mrr numeric(15,2) DEFAULT 0, arr numeric(15,2) DEFAULT 0, new_revenue numeric(15,2) DEFAULT 0,
  expansion_revenue numeric(15,2) DEFAULT 0, churned_revenue numeric(15,2) DEFAULT 0, net_revenue numeric(15,2) DEFAULT 0,
  new_customers integer DEFAULT 0, churned_customers integer DEFAULT 0, active_customers integer DEFAULT 0,
  created_at timestamp DEFAULT now() NOT NULL
);
CREATE TABLE IF NOT EXISTS notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), organization_id uuid NOT NULL REFERENCES organizations(id), user_id uuid NOT NULL REFERENCES users(id),
  title text NOT NULL, body text, type text DEFAULT 'info', link text, read boolean DEFAULT false,
  metadata jsonb DEFAULT '{}'::jsonb, created_at timestamp DEFAULT now() NOT NULL
);
CREATE TABLE IF NOT EXISTS marketing_spend (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), organization_id uuid NOT NULL REFERENCES organizations(id), month text NOT NULL,
  channel text DEFAULT 'other' NOT NULL, amount numeric(15,2) NOT NULL, notes text,
  created_at timestamp DEFAULT now() NOT NULL, updated_at timestamp DEFAULT now() NOT NULL
);
CREATE TABLE IF NOT EXISTS nps_responses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), organization_id uuid NOT NULL REFERENCES organizations(id), contact_id uuid REFERENCES contacts(id),
  token text NOT NULL UNIQUE, score integer, feedback text, submitted_at timestamp, created_at timestamp DEFAULT now() NOT NULL
);
CREATE TABLE IF NOT EXISTS subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), organization_id uuid NOT NULL REFERENCES organizations(id), contact_id uuid REFERENCES contacts(id),
  product_id uuid REFERENCES products(id), status text DEFAULT 'active', current_period_start timestamp NOT NULL, current_period_end timestamp NOT NULL,
  amount numeric(15,2) NOT NULL, currency text DEFAULT 'USD', interval text DEFAULT 'month', cancelled_at timestamp,
  metadata jsonb DEFAULT '{}'::jsonb, created_at timestamp DEFAULT now() NOT NULL, updated_at timestamp DEFAULT now() NOT NULL
);
CREATE TABLE IF NOT EXISTS affiliates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), organization_id uuid NOT NULL REFERENCES organizations(id), contact_id uuid REFERENCES contacts(id),
  code text NOT NULL, status text DEFAULT 'active', commission_rate numeric(5,2) DEFAULT 10, total_clicks integer DEFAULT 0,
  total_conversions integer DEFAULT 0, total_revenue numeric(15,2) DEFAULT 0, total_earnings numeric(15,2) DEFAULT 0,
  paid_earnings numeric(15,2) DEFAULT 0, created_at timestamp DEFAULT now() NOT NULL, updated_at timestamp DEFAULT now() NOT NULL
);
CREATE TABLE IF NOT EXISTS marketing_forms (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), organization_id uuid NOT NULL REFERENCES organizations(id), name text NOT NULL,
  description text, fields jsonb DEFAULT '[]'::jsonb, status text DEFAULT 'active', submissions integer DEFAULT 0, embed_code text,
  created_at timestamp DEFAULT now() NOT NULL, updated_at timestamp DEFAULT now() NOT NULL
);
CREATE TABLE IF NOT EXISTS social_posts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), organization_id uuid NOT NULL REFERENCES organizations(id), content text NOT NULL,
  platforms text[] DEFAULT ARRAY[]::text[], status text DEFAULT 'draft', scheduled_at timestamp, published_at timestamp,
  media_urls text[] DEFAULT ARRAY[]::text[], engagement jsonb DEFAULT '{"likes":0,"comments":0,"shares":0,"clicks":0}'::jsonb,
  created_at timestamp DEFAULT now() NOT NULL, updated_at timestamp DEFAULT now() NOT NULL
);
CREATE TABLE IF NOT EXISTS kb_articles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), organization_id uuid NOT NULL REFERENCES organizations(id), title text NOT NULL, slug text NOT NULL,
  excerpt text, content text DEFAULT '', category text DEFAULT 'General', tags text[] DEFAULT ARRAY[]::text[], status text DEFAULT 'draft',
  views integer DEFAULT 0, helpful_yes integer DEFAULT 0, helpful_no integer DEFAULT 0,
  created_at timestamp DEFAULT now() NOT NULL, updated_at timestamp DEFAULT now() NOT NULL
);
CREATE TABLE IF NOT EXISTS website_pages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), organization_id uuid NOT NULL REFERENCES organizations(id), title text NOT NULL, slug text NOT NULL,
  content text DEFAULT '', status text DEFAULT 'draft', meta_title text, meta_description text, views integer DEFAULT 0,
  created_at timestamp DEFAULT now() NOT NULL, updated_at timestamp DEFAULT now() NOT NULL
);
CREATE TABLE IF NOT EXISTS blog_posts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), organization_id uuid NOT NULL REFERENCES organizations(id), title text NOT NULL, slug text NOT NULL,
  excerpt text, content text DEFAULT '', category text DEFAULT 'General', author_id uuid REFERENCES users(id), featured_image text,
  status text DEFAULT 'draft', meta_title text, meta_description text, published_at timestamp, views integer DEFAULT 0,
  created_at timestamp DEFAULT now() NOT NULL, updated_at timestamp DEFAULT now() NOT NULL
);
CREATE TABLE IF NOT EXISTS automation_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), organization_id uuid NOT NULL REFERENCES organizations(id), event text NOT NULL,
  contact_id uuid REFERENCES contacts(id), workflow_id uuid REFERENCES workflows(id), status text DEFAULT 'received',
  metadata jsonb DEFAULT '{}'::jsonb, triggered_at timestamp DEFAULT now() NOT NULL
);
CREATE TABLE IF NOT EXISTS workflow_enrollments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), organization_id uuid NOT NULL REFERENCES organizations(id), workflow_id uuid NOT NULL REFERENCES workflows(id),
  contact_id uuid REFERENCES contacts(id), deal_id uuid REFERENCES deals(id), event text DEFAULT 'manual' NOT NULL, context jsonb DEFAULT '{}'::jsonb,
  idempotency_key text, next_step_index integer DEFAULT 0 NOT NULL, resume_at timestamp NOT NULL, status text DEFAULT 'pending' NOT NULL,
  attempt_count integer DEFAULT 0 NOT NULL, max_attempts integer DEFAULT 5 NOT NULL, last_error text, locked_at timestamp, lock_token text,
  completed_at timestamp, created_at timestamp DEFAULT now() NOT NULL, updated_at timestamp DEFAULT now() NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS workflow_enrollments_idempotency_uidx ON workflow_enrollments(organization_id,workflow_id,idempotency_key);
CREATE TABLE IF NOT EXISTS workflow_step_executions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), organization_id uuid NOT NULL REFERENCES organizations(id), enrollment_id uuid NOT NULL REFERENCES workflow_enrollments(id),
  workflow_id uuid NOT NULL REFERENCES workflows(id), step_index integer NOT NULL, step_type text NOT NULL, status text DEFAULT 'processing' NOT NULL,
  attempt_count integer DEFAULT 1 NOT NULL, idempotency_key text NOT NULL, provider_message_id text, result jsonb DEFAULT '{}'::jsonb,
  last_error text, started_at timestamp DEFAULT now() NOT NULL, completed_at timestamp, updated_at timestamp DEFAULT now() NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS workflow_step_executions_enrollment_step_uidx ON workflow_step_executions(enrollment_id,step_index);
CREATE UNIQUE INDEX IF NOT EXISTS workflow_step_executions_idempotency_uidx ON workflow_step_executions(idempotency_key);
CREATE INDEX IF NOT EXISTS workflow_step_executions_org_time_idx ON workflow_step_executions(organization_id,started_at);

CREATE INDEX IF NOT EXISTS contacts_org_idx ON contacts(organization_id);
CREATE INDEX IF NOT EXISTS companies_org_idx ON companies(organization_id);
CREATE INDEX IF NOT EXISTS pipelines_org_idx ON pipelines(organization_id);
CREATE INDEX IF NOT EXISTS deals_org_idx ON deals(organization_id);
CREATE INDEX IF NOT EXISTS activities_org_idx ON activities(organization_id);
CREATE INDEX IF NOT EXISTS tasks_org_idx ON tasks(organization_id);
CREATE INDEX IF NOT EXISTS email_templates_org_idx ON email_templates(organization_id);
CREATE INDEX IF NOT EXISTS campaigns_org_idx ON campaigns(organization_id);
CREATE INDEX IF NOT EXISTS workflows_org_idx ON workflows(organization_id);
CREATE INDEX IF NOT EXISTS tickets_org_idx ON tickets(organization_id);
CREATE INDEX IF NOT EXISTS products_org_idx ON products(organization_id);
CREATE INDEX IF NOT EXISTS orders_org_idx ON orders(organization_id);
CREATE INDEX IF NOT EXISTS analytics_org_idx ON analytics_events(organization_id);
CREATE INDEX IF NOT EXISTS revenue_metrics_org_date_idx ON revenue_metrics(organization_id,date);
CREATE INDEX IF NOT EXISTS notifications_org_idx ON notifications(organization_id);
CREATE INDEX IF NOT EXISTS marketing_spend_org_idx ON marketing_spend(organization_id);
CREATE INDEX IF NOT EXISTS nps_org_idx ON nps_responses(organization_id);
CREATE INDEX IF NOT EXISTS subscriptions_org_idx ON subscriptions(organization_id);
CREATE UNIQUE INDEX IF NOT EXISTS affiliates_org_code_uidx ON affiliates(organization_id,code);
CREATE INDEX IF NOT EXISTS marketing_forms_org_idx ON marketing_forms(organization_id);
CREATE INDEX IF NOT EXISTS social_posts_org_idx ON social_posts(organization_id);
CREATE UNIQUE INDEX IF NOT EXISTS kb_articles_org_slug_uidx ON kb_articles(organization_id,slug);
CREATE UNIQUE INDEX IF NOT EXISTS website_pages_org_slug_uidx ON website_pages(organization_id,slug);
CREATE UNIQUE INDEX IF NOT EXISTS blog_posts_org_slug_uidx ON blog_posts(organization_id,slug);
CREATE INDEX IF NOT EXISTS automation_logs_org_idx ON automation_logs(organization_id);
CREATE INDEX IF NOT EXISTS workflow_enrollments_due_idx ON workflow_enrollments(status,resume_at);
