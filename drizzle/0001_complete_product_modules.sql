CREATE TABLE IF NOT EXISTS "subscriptions" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "organization_id" uuid NOT NULL REFERENCES "organizations"("id"),
  "contact_id" uuid REFERENCES "contacts"("id"),
  "product_id" uuid REFERENCES "products"("id"),
  "status" text DEFAULT 'active',
  "current_period_start" timestamp NOT NULL,
  "current_period_end" timestamp NOT NULL,
  "amount" numeric(15,2) NOT NULL,
  "currency" text DEFAULT 'USD',
  "interval" text DEFAULT 'month',
  "cancelled_at" timestamp,
  "metadata" jsonb DEFAULT '{}'::jsonb,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "affiliates" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "organization_id" uuid NOT NULL REFERENCES "organizations"("id"),
  "contact_id" uuid REFERENCES "contacts"("id"),
  "code" text NOT NULL,
  "status" text DEFAULT 'active',
  "commission_rate" numeric(5,2) DEFAULT '10',
  "total_clicks" integer DEFAULT 0,
  "total_conversions" integer DEFAULT 0,
  "total_revenue" numeric(15,2) DEFAULT '0',
  "total_earnings" numeric(15,2) DEFAULT '0',
  "paid_earnings" numeric(15,2) DEFAULT '0',
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);
CREATE INDEX IF NOT EXISTS "affiliates_org_idx" ON "affiliates" ("organization_id");
CREATE INDEX IF NOT EXISTS "affiliates_code_idx" ON "affiliates" ("code");

CREATE TABLE IF NOT EXISTS "marketing_forms" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "organization_id" uuid NOT NULL REFERENCES "organizations"("id"),
  "name" text NOT NULL,
  "description" text,
  "fields" jsonb DEFAULT '[]'::jsonb,
  "status" text DEFAULT 'active',
  "submissions" integer DEFAULT 0,
  "embed_code" text,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "social_posts" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "organization_id" uuid NOT NULL REFERENCES "organizations"("id"),
  "content" text NOT NULL,
  "platforms" text[] DEFAULT ARRAY[]::text[],
  "status" text DEFAULT 'draft',
  "scheduled_at" timestamp,
  "published_at" timestamp,
  "media_urls" text[] DEFAULT ARRAY[]::text[],
  "engagement" jsonb DEFAULT '{"likes":0,"comments":0,"shares":0,"clicks":0}'::jsonb,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "kb_articles" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "organization_id" uuid NOT NULL REFERENCES "organizations"("id"),
  "title" text NOT NULL,
  "slug" text NOT NULL,
  "excerpt" text,
  "content" text DEFAULT '',
  "category" text DEFAULT 'General',
  "tags" text[] DEFAULT ARRAY[]::text[],
  "status" text DEFAULT 'draft',
  "views" integer DEFAULT 0,
  "helpful_yes" integer DEFAULT 0,
  "helpful_no" integer DEFAULT 0,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "website_pages" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "organization_id" uuid NOT NULL REFERENCES "organizations"("id"),
  "title" text NOT NULL,
  "slug" text NOT NULL,
  "content" text DEFAULT '',
  "status" text DEFAULT 'draft',
  "meta_title" text,
  "meta_description" text,
  "views" integer DEFAULT 0,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "blog_posts" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "organization_id" uuid NOT NULL REFERENCES "organizations"("id"),
  "title" text NOT NULL,
  "slug" text NOT NULL,
  "excerpt" text,
  "content" text DEFAULT '',
  "category" text DEFAULT 'General',
  "author_id" uuid REFERENCES "users"("id"),
  "featured_image" text,
  "status" text DEFAULT 'draft',
  "meta_title" text,
  "meta_description" text,
  "published_at" timestamp,
  "views" integer DEFAULT 0,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "automation_logs" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "organization_id" uuid NOT NULL REFERENCES "organizations"("id"),
  "event" text NOT NULL,
  "contact_id" uuid REFERENCES "contacts"("id"),
  "workflow_id" uuid REFERENCES "workflows"("id"),
  "status" text DEFAULT 'received',
  "metadata" jsonb DEFAULT '{}'::jsonb,
  "triggered_at" timestamp DEFAULT now() NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS "affiliates_org_code_uidx"
  ON "affiliates" ("organization_id", "code");
DROP INDEX IF EXISTS "affiliates_code_idx";
CREATE UNIQUE INDEX IF NOT EXISTS "kb_articles_org_slug_uidx"
  ON "kb_articles" ("organization_id", "slug");
CREATE UNIQUE INDEX IF NOT EXISTS "website_pages_org_slug_uidx"
  ON "website_pages" ("organization_id", "slug");
CREATE UNIQUE INDEX IF NOT EXISTS "blog_posts_org_slug_uidx"
  ON "blog_posts" ("organization_id", "slug");
