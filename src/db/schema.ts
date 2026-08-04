import {
  pgTable,
  text,
  integer,
  decimal,
  boolean,
  timestamp,
  jsonb,
  uuid,
  pgEnum,
  index,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";

// ─── Enums ───────────────────────────────────────────────────────────────────

export const contactStatusEnum = pgEnum("contact_status", [
  "lead",
  "prospect",
  "customer",
  "churned",
  "vip",
]);

export const dealStageEnum = pgEnum("deal_stage", [
  "prospecting",
  "qualification",
  "proposal",
  "negotiation",
  "closed_won",
  "closed_lost",
]);

export const activityTypeEnum = pgEnum("activity_type", [
  "call",
  "email",
  "meeting",
  "note",
  "task",
  "sms",
  "whatsapp",
]);

export const campaignStatusEnum = pgEnum("campaign_status", [
  "draft",
  "scheduled",
  "sending",
  "sent",
  "paused",
  "cancelled",
]);

export const campaignTypeEnum = pgEnum("campaign_type", [
  "email",
  "sms",
  "push",
  "whatsapp",
  "social",
]);

export const taskStatusEnum = pgEnum("task_status", [
  "todo",
  "in_progress",
  "completed",
  "cancelled",
]);

export const taskPriorityEnum = pgEnum("task_priority", [
  "low",
  "medium",
  "high",
  "urgent",
]);

export const workflowStatusEnum = pgEnum("workflow_status", [
  "draft",
  "active",
  "paused",
  "archived",
]);

export const ticketStatusEnum = pgEnum("ticket_status", [
  "open",
  "in_progress",
  "waiting",
  "resolved",
  "closed",
]);

export const ticketPriorityEnum = pgEnum("ticket_priority", [
  "low",
  "medium",
  "high",
  "critical",
]);

export const userRoleEnum = pgEnum("user_role", [
  "owner",
  "admin",
  "manager",
  "member",
  "viewer",
]);

export const subscriptionPlanEnum = pgEnum("subscription_plan", [
  "starter",
  "professional",
  "enterprise",
  "unlimited",
]);

// ─── Core Tables ─────────────────────────────────────────────────────────────

export const organizations = pgTable("organizations", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(),
  spaceTenantId: text("space_tenant_id").unique(),
  logo: text("logo"),
  website: text("website"),
  industry: text("industry"),
  size: text("size"),
  plan: subscriptionPlanEnum("plan").default("starter"),
  settings: jsonb("settings").default({}),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: uuid("organization_id").references(() => organizations.id), // legacy primary workspace; memberships are canonical
  spaceUserId: text("space_user_id").unique(),
  email: text("email").notNull(),
  name: text("name").notNull(),
  avatar: text("avatar"),
  role: userRoleEnum("role").default("member"),
  jobTitle: text("job_title"),
  phone: text("phone"),
  timezone: text("timezone").default("America/New_York"),
  preferences: jsonb("preferences").default({}),
  lastActiveAt: timestamp("last_active_at"),
  authVersion: integer("auth_version").default(1).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// ─── CRM ─────────────────────────────────────────────────────────────────────

export const contacts = pgTable(
  "contacts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .references(() => organizations.id)
      .notNull(),
    firstName: text("first_name").notNull(),
    lastName: text("last_name"),
    email: text("email"),
    phone: text("phone"),
    mobile: text("mobile"),
    avatar: text("avatar"),
    status: contactStatusEnum("status").default("lead"),
    source: text("source"),
    companyId: uuid("company_id").references(() => companies.id),
    jobTitle: text("job_title"),
    department: text("department"),
    website: text("website"),
    linkedIn: text("linked_in"),
    twitter: text("twitter"),
    address: jsonb("address").default({}),
    tags: text("tags").array().default([]),
    score: integer("score").default(0),
    ownerId: uuid("owner_id").references(() => users.id),
    customFields: jsonb("custom_fields").default({}),
    lastContactedAt: timestamp("last_contacted_at"),
    archivedAt: timestamp("archived_at"),
    archivedByUserId: uuid("archived_by_user_id").references(() => users.id),
    deletionReason: text("deletion_reason"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [index("contacts_org_idx").on(table.organizationId)]
);

export const companies = pgTable("companies", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: uuid("organization_id")
    .references(() => organizations.id)
    .notNull(),
  name: text("name").notNull(),
  domain: text("domain"),
  logo: text("logo"),
  industry: text("industry"),
  size: text("size"),
  revenue: decimal("revenue", { precision: 15, scale: 2 }),
  website: text("website"),
  phone: text("phone"),
  address: jsonb("address").default({}),
  tags: text("tags").array().default([]),
  ownerId: uuid("owner_id").references(() => users.id),
  customFields: jsonb("custom_fields").default({}),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const pipelines = pgTable("pipelines", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: uuid("organization_id")
    .references(() => organizations.id)
    .notNull(),
  name: text("name").notNull(),
  description: text("description"),
  currency: text("currency").default("USD"),
  isDefault: boolean("is_default").default(false),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const pipelineStages = pgTable("pipeline_stages", {
  id: uuid("id").primaryKey().defaultRandom(),
  pipelineId: uuid("pipeline_id")
    .references(() => pipelines.id)
    .notNull(),
  name: text("name").notNull(),
  order: integer("order").notNull(),
  probability: integer("probability").default(0),
  color: text("color").default("#6366f1"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const deals = pgTable(
  "deals",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .references(() => organizations.id)
      .notNull(),
    pipelineId: uuid("pipeline_id").references(() => pipelines.id),
    stageId: uuid("stage_id").references(() => pipelineStages.id),
    name: text("name").notNull(),
    value: decimal("value", { precision: 15, scale: 2 }).default("0"),
    currency: text("currency").default("USD"),
    stage: dealStageEnum("stage").default("prospecting"),
    probability: integer("probability").default(0),
    expectedCloseDate: timestamp("expected_close_date"),
    contactId: uuid("contact_id").references(() => contacts.id),
    companyId: uuid("company_id").references(() => companies.id),
    ownerId: uuid("owner_id").references(() => users.id),
    tags: text("tags").array().default([]),
    customFields: jsonb("custom_fields").default({}),
    notes: text("notes"),
    lostReason: text("lost_reason"),
    wonAt: timestamp("won_at"),
    lostAt: timestamp("lost_at"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [index("deals_org_idx").on(table.organizationId)]
);

export const activities = pgTable("activities", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: uuid("organization_id")
    .references(() => organizations.id)
    .notNull(),
  type: activityTypeEnum("type").notNull(),
  subject: text("subject").notNull(),
  body: text("body"),
  contactId: uuid("contact_id").references(() => contacts.id),
  companyId: uuid("company_id").references(() => companies.id),
  dealId: uuid("deal_id").references(() => deals.id),
  userId: uuid("user_id").references(() => users.id),
  scheduledAt: timestamp("scheduled_at"),
  completedAt: timestamp("completed_at"),
  duration: integer("duration"),
  outcome: text("outcome"),
  metadata: jsonb("metadata").default({}),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const tasks = pgTable("tasks", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: uuid("organization_id")
    .references(() => organizations.id)
    .notNull(),
  title: text("title").notNull(),
  description: text("description"),
  status: taskStatusEnum("status").default("todo"),
  priority: taskPriorityEnum("priority").default("medium"),
  assigneeId: uuid("assignee_id").references(() => users.id),
  contactId: uuid("contact_id").references(() => contacts.id),
  dealId: uuid("deal_id").references(() => deals.id),
  dueDate: timestamp("due_date"),
  completedAt: timestamp("completed_at"),
  tags: text("tags").array().default([]),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// ─── Email Marketing ──────────────────────────────────────────────────────────

export const emailTemplates = pgTable("email_templates", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: uuid("organization_id")
    .references(() => organizations.id)
    .notNull(),
  name: text("name").notNull(),
  subject: text("subject").notNull(),
  preheader: text("preheader"),
  htmlContent: text("html_content"),
  jsonContent: jsonb("json_content"),
  category: text("category"),
  tags: text("tags").array().default([]),
  thumbnail: text("thumbnail"),
  isPublic: boolean("is_public").default(false),
  createdById: uuid("created_by_id").references(() => users.id),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const campaigns = pgTable("campaigns", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: uuid("organization_id")
    .references(() => organizations.id)
    .notNull(),
  name: text("name").notNull(),
  type: campaignTypeEnum("type").default("email"),
  status: campaignStatusEnum("status").default("draft"),
  subject: text("subject"),
  preheader: text("preheader"),
  fromName: text("from_name"),
  fromEmail: text("from_email"),
  replyTo: text("reply_to"),
  templateId: uuid("template_id").references(() => emailTemplates.id),
  content: jsonb("content"),
  audienceFilters: jsonb("audience_filters").default({}),
  scheduledAt: timestamp("scheduled_at"),
  sentAt: timestamp("sent_at"),
  stats: jsonb("stats").default({
    sent: 0,
    delivered: 0,
    opened: 0,
    clicked: 0,
    bounced: 0,
    unsubscribed: 0,
    revenue: 0,
  }),
  settings: jsonb("settings").default({}),
  createdById: uuid("created_by_id").references(() => users.id),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// ─── Automation ───────────────────────────────────────────────────────────────

export const workflows = pgTable("workflows", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: uuid("organization_id")
    .references(() => organizations.id)
    .notNull(),
  name: text("name").notNull(),
  description: text("description"),
  status: workflowStatusEnum("status").default("draft"),
  trigger: jsonb("trigger").notNull(),
  steps: jsonb("steps").default([]),
  enrolledCount: integer("enrolled_count").default(0),
  completedCount: integer("completed_count").default(0),
  conversionRate: decimal("conversion_rate", { precision: 5, scale: 2 }).default("0"),
  tags: text("tags").array().default([]),
  version: integer("version").default(1),
  createdById: uuid("created_by_id").references(() => users.id),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const workflowVersions = pgTable("workflow_versions", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: uuid("organization_id").references(() => organizations.id).notNull(),
  workflowId: uuid("workflow_id").references(() => workflows.id).notNull(),
  version: integer("version").notNull(),
  definition: jsonb("definition").notNull(),
  checksum: text("checksum").notNull(),
  status: text("status").default("draft").notNull(),
  createdById: uuid("created_by_id").references(() => users.id),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  publishedAt: timestamp("published_at"),
}, (table) => [
  uniqueIndex("workflow_versions_workflow_version_uidx").on(table.organizationId, table.workflowId, table.version),
  uniqueIndex("workflow_versions_workflow_checksum_uidx").on(table.organizationId, table.workflowId, table.checksum),
  index("workflow_versions_org_status_idx").on(table.organizationId, table.status, table.createdAt),
]);

export const workflowActiveVersions = pgTable("workflow_active_versions", {
  workflowId: uuid("workflow_id").primaryKey().references(() => workflows.id),
  organizationId: uuid("organization_id").references(() => organizations.id).notNull(),
  versionId: uuid("version_id").references(() => workflowVersions.id).notNull(),
  activatedById: uuid("activated_by_id").references(() => users.id),
  activatedAt: timestamp("activated_at").defaultNow().notNull(),
}, (table) => [
  uniqueIndex("workflow_active_versions_org_workflow_uidx").on(table.organizationId, table.workflowId),
  index("workflow_active_versions_version_idx").on(table.versionId),
]);

// ─── Support / Tickets ────────────────────────────────────────────────────────

export const tickets = pgTable("tickets", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: uuid("organization_id")
    .references(() => organizations.id)
    .notNull(),
  ticketNumber: text("ticket_number").notNull(),
  subject: text("subject").notNull(),
  description: text("description"),
  status: ticketStatusEnum("status").default("open"),
  priority: ticketPriorityEnum("priority").default("medium"),
  contactId: uuid("contact_id").references(() => contacts.id),
  assigneeId: uuid("assignee_id").references(() => users.id),
  tags: text("tags").array().default([]),
  source: text("source"),
  resolvedAt: timestamp("resolved_at"),
  firstResponseAt: timestamp("first_response_at"),
  satisfactionScore: integer("satisfaction_score"),
  customFields: jsonb("custom_fields").default({}),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// ─── Commerce ─────────────────────────────────────────────────────────────────

export const products = pgTable("products", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: uuid("organization_id")
    .references(() => organizations.id)
    .notNull(),
  name: text("name").notNull(),
  description: text("description"),
  sku: text("sku"),
  type: text("type").default("digital"),
  price: decimal("price", { precision: 15, scale: 2 }).notNull(),
  currency: text("currency").default("USD"),
  recurring: boolean("recurring").default(false),
  interval: text("interval"),
  trialDays: integer("trial_days"),
  inventory: integer("inventory"),
  unlimited: boolean("unlimited").default(true),
  images: text("images").array().default([]),
  tags: text("tags").array().default([]),
  metadata: jsonb("metadata").default({}),
  isActive: boolean("is_active").default(true),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const orders = pgTable("orders", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: uuid("organization_id")
    .references(() => organizations.id)
    .notNull(),
  orderNumber: text("order_number").notNull(),
  contactId: uuid("contact_id").references(() => contacts.id),
  status: text("status").default("pending"),
  subtotal: decimal("subtotal", { precision: 15, scale: 2 }).default("0"),
  tax: decimal("tax", { precision: 15, scale: 2 }).default("0"),
  discount: decimal("discount", { precision: 15, scale: 2 }).default("0"),
  total: decimal("total", { precision: 15, scale: 2 }).default("0"),
  currency: text("currency").default("USD"),
  items: jsonb("items").default([]),
  paymentMethod: text("payment_method"),
  paymentStatus: text("payment_status").default("pending"),
  notes: text("notes"),
  metadata: jsonb("metadata").default({}),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// ─── Analytics ────────────────────────────────────────────────────────────────

export const analyticsEvents = pgTable(
  "analytics_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .references(() => organizations.id)
      .notNull(),
    event: text("event").notNull(),
    properties: jsonb("properties").default({}),
    contactId: uuid("contact_id").references(() => contacts.id),
    sessionId: text("session_id"),
    source: text("source"),
    medium: text("medium"),
    campaign: text("campaign"),
    revenue: decimal("revenue", { precision: 15, scale: 2 }),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [index("analytics_org_idx").on(table.organizationId)]
);

export const revenueMetrics = pgTable("revenue_metrics", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: uuid("organization_id")
    .references(() => organizations.id)
    .notNull(),
  date: timestamp("date").notNull(),
  mrr: decimal("mrr", { precision: 15, scale: 2 }).default("0"),
  arr: decimal("arr", { precision: 15, scale: 2 }).default("0"),
  newRevenue: decimal("new_revenue", { precision: 15, scale: 2 }).default("0"),
  expansionRevenue: decimal("expansion_revenue", { precision: 15, scale: 2 }).default("0"),
  churnedRevenue: decimal("churned_revenue", { precision: 15, scale: 2 }).default("0"),
  netRevenue: decimal("net_revenue", { precision: 15, scale: 2 }).default("0"),
  newCustomers: integer("new_customers").default(0),
  churnedCustomers: integer("churned_customers").default(0),
  activeCustomers: integer("active_customers").default(0),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// ─── Notifications ────────────────────────────────────────────────────────────

export const notifications = pgTable("notifications", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: uuid("organization_id")
    .references(() => organizations.id)
    .notNull(),
  userId: uuid("user_id")
    .references(() => users.id)
    .notNull(),
  title: text("title").notNull(),
  body: text("body"),
  type: text("type").default("info"),
  link: text("link"),
  read: boolean("read").default(false),
  metadata: jsonb("metadata").default({}),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// ─── Growth / CAC ────────────────────────────────────────────────────────────

export const marketingSpend = pgTable("marketing_spend", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: uuid("organization_id").references(() => organizations.id).notNull(),
  month: text("month").notNull(), // "YYYY-MM"
  channel: text("channel").notNull().default("other"),
  amount: decimal("amount", { precision: 15, scale: 2 }).notNull(),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// ─── NPS ─────────────────────────────────────────────────────────────────────

export const npsResponses = pgTable("nps_responses", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: uuid("organization_id").references(() => organizations.id).notNull(),
  contactId: uuid("contact_id").references(() => contacts.id),
  token: text("token").notNull().unique(),
  score: integer("score"), // 0-10, null until submitted
  feedback: text("feedback"),
  submittedAt: timestamp("submitted_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// ─── Extended Product Modules ─────────────────────────────────────────────────

export const subscriptions = pgTable("subscriptions", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: uuid("organization_id").references(() => organizations.id).notNull(),
  contactId: uuid("contact_id").references(() => contacts.id),
  productId: uuid("product_id").references(() => products.id),
  status: text("status").default("active"),
  currentPeriodStart: timestamp("current_period_start").notNull(),
  currentPeriodEnd: timestamp("current_period_end").notNull(),
  amount: decimal("amount", { precision: 15, scale: 2 }).notNull(),
  currency: text("currency").default("USD"),
  interval: text("interval").default("month"),
  cancelledAt: timestamp("cancelled_at"),
  metadata: jsonb("metadata").default({}),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const affiliates = pgTable("affiliates", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: uuid("organization_id").references(() => organizations.id).notNull(),
  contactId: uuid("contact_id").references(() => contacts.id),
  code: text("code").notNull(),
  status: text("status").default("active"),
  commissionRate: decimal("commission_rate", { precision: 5, scale: 2 }).default("10"),
  totalClicks: integer("total_clicks").default(0),
  totalConversions: integer("total_conversions").default(0),
  totalRevenue: decimal("total_revenue", { precision: 15, scale: 2 }).default("0"),
  totalEarnings: decimal("total_earnings", { precision: 15, scale: 2 }).default("0"),
  paidEarnings: decimal("paid_earnings", { precision: 15, scale: 2 }).default("0"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => [
  index("affiliates_org_idx").on(table.organizationId),
  uniqueIndex("affiliates_org_code_uidx").on(table.organizationId, table.code),
]);

export const marketingForms = pgTable("marketing_forms", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: uuid("organization_id").references(() => organizations.id).notNull(),
  name: text("name").notNull(),
  description: text("description"),
  fields: jsonb("fields").default([]),
  status: text("status").default("active"),
  submissions: integer("submissions").default(0),
  embedCode: text("embed_code"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const socialPosts = pgTable("social_posts", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: uuid("organization_id").references(() => organizations.id).notNull(),
  content: text("content").notNull(),
  platforms: text("platforms").array().default([]),
  status: text("status").default("draft"),
  scheduledAt: timestamp("scheduled_at"),
  publishedAt: timestamp("published_at"),
  mediaUrls: text("media_urls").array().default([]),
  engagement: jsonb("engagement").default({ likes: 0, comments: 0, shares: 0, clicks: 0 }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const kbArticles = pgTable("kb_articles", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: uuid("organization_id").references(() => organizations.id).notNull(),
  title: text("title").notNull(),
  slug: text("slug").notNull(),
  excerpt: text("excerpt"),
  content: text("content").default(""),
  category: text("category").default("General"),
  tags: text("tags").array().default([]),
  status: text("status").default("draft"),
  views: integer("views").default(0),
  helpfulYes: integer("helpful_yes").default(0),
  helpfulNo: integer("helpful_no").default(0),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => [
  uniqueIndex("kb_articles_org_slug_uidx").on(table.organizationId, table.slug),
]);

export const websitePages = pgTable("website_pages", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: uuid("organization_id").references(() => organizations.id).notNull(),
  title: text("title").notNull(),
  slug: text("slug").notNull(),
  content: text("content").default(""),
  status: text("status").default("draft"),
  metaTitle: text("meta_title"),
  metaDescription: text("meta_description"),
  views: integer("views").default(0),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => [
  uniqueIndex("website_pages_org_slug_uidx").on(table.organizationId, table.slug),
]);

export const blogPosts = pgTable("blog_posts", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: uuid("organization_id").references(() => organizations.id).notNull(),
  title: text("title").notNull(),
  slug: text("slug").notNull(),
  excerpt: text("excerpt"),
  content: text("content").default(""),
  category: text("category").default("General"),
  authorId: uuid("author_id").references(() => users.id),
  featuredImage: text("featured_image"),
  status: text("status").default("draft"),
  metaTitle: text("meta_title"),
  metaDescription: text("meta_description"),
  publishedAt: timestamp("published_at"),
  views: integer("views").default(0),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => [
  uniqueIndex("blog_posts_org_slug_uidx").on(table.organizationId, table.slug),
]);

export const automationLogs = pgTable("automation_logs", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: uuid("organization_id").references(() => organizations.id).notNull(),
  event: text("event").notNull(),
  contactId: uuid("contact_id").references(() => contacts.id),
  workflowId: uuid("workflow_id").references(() => workflows.id),
  status: text("status").default("received"),
  metadata: jsonb("metadata").default({}),
  triggeredAt: timestamp("triggered_at").defaultNow().notNull(),
});

export const workflowEnrollments = pgTable("workflow_enrollments", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: uuid("organization_id").references(() => organizations.id).notNull(),
  workflowId: uuid("workflow_id").references(() => workflows.id).notNull(),
  workflowVersionId: uuid("workflow_version_id").references(() => workflowVersions.id),
  contactId: uuid("contact_id").references(() => contacts.id),
  dealId: uuid("deal_id").references(() => deals.id),
  event: text("event").default("manual").notNull(),
  context: jsonb("context").default({}),
  idempotencyKey: text("idempotency_key"),
  nextStepIndex: integer("next_step_index").notNull().default(0),
  resumeAt: timestamp("resume_at").notNull(),
  status: text("status").notNull().default("pending"),
  attemptCount: integer("attempt_count").default(0).notNull(),
  maxAttempts: integer("max_attempts").default(5).notNull(),
  lastError: text("last_error"),
  lockedAt: timestamp("locked_at"),
  lockToken: text("lock_token"),
  completedAt: timestamp("completed_at"),
  exitType: text("exit_type"),
  exitReason: text("exit_reason"),
  exitedAt: timestamp("exited_at"),
  goalReachedAt: timestamp("goal_reached_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => [
  uniqueIndex("workflow_enrollments_idempotency_uidx").on(table.organizationId, table.workflowId, table.idempotencyKey),
  index("workflow_enrollments_due_idx").on(table.status, table.resumeAt),
]);

export const workflowStepExecutions = pgTable("workflow_step_executions", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: uuid("organization_id").references(() => organizations.id).notNull(),
  enrollmentId: uuid("enrollment_id").references(() => workflowEnrollments.id).notNull(),
  workflowId: uuid("workflow_id").references(() => workflows.id).notNull(),
  stepIndex: integer("step_index").notNull(),
  stepType: text("step_type").notNull(),
  status: text("status").default("processing").notNull(),
  attemptCount: integer("attempt_count").default(1).notNull(),
  idempotencyKey: text("idempotency_key").notNull(),
  providerMessageId: text("provider_message_id"),
  result: jsonb("result").default({}),
  lastError: text("last_error"),
  startedAt: timestamp("started_at").defaultNow().notNull(),
  completedAt: timestamp("completed_at"),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => [
  uniqueIndex("workflow_step_executions_enrollment_step_uidx").on(table.enrollmentId, table.stepIndex),
  uniqueIndex("workflow_step_executions_idempotency_uidx").on(table.idempotencyKey),
  index("workflow_step_executions_org_time_idx").on(table.organizationId, table.startedAt),
]);


export const workflowGoalEvents = pgTable("workflow_goal_events", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: uuid("organization_id").references(() => organizations.id).notNull(),
  workflowId: uuid("workflow_id").references(() => workflows.id).notNull(),
  workflowVersionId: uuid("workflow_version_id").references(() => workflowVersions.id),
  enrollmentId: uuid("enrollment_id").references(() => workflowEnrollments.id).notNull(),
  contactId: uuid("contact_id").references(() => contacts.id),
  dealId: uuid("deal_id").references(() => deals.id),
  goalKey: text("goal_key").notNull(),
  goalName: text("goal_name").notNull(),
  metadata: jsonb("metadata").default({}).notNull(),
  reachedAt: timestamp("reached_at").defaultNow().notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => [
  uniqueIndex("workflow_goal_events_enrollment_goal_uidx").on(table.organizationId, table.enrollmentId, table.goalKey),
  uniqueIndex("workflow_goal_events_org_id_uidx").on(table.organizationId, table.id),
  index("workflow_goal_events_workflow_time_idx").on(table.organizationId, table.workflowId, table.reachedAt),
]);

export const workflowExperimentAssignments = pgTable("workflow_experiment_assignments", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: uuid("organization_id").references(() => organizations.id).notNull(),
  workflowId: uuid("workflow_id").references(() => workflows.id).notNull(),
  workflowVersionId: uuid("workflow_version_id").references(() => workflowVersions.id),
  enrollmentId: uuid("enrollment_id").references(() => workflowEnrollments.id).notNull(),
  stepIndex: integer("step_index").notNull(),
  experimentKey: text("experiment_key").notNull(),
  variantId: text("variant_id").notNull(),
  variantName: text("variant_name").notNull(),
  targetIndex: integer("target_index").notNull(),
  metadata: jsonb("metadata").default({}).notNull(),
  assignedAt: timestamp("assigned_at").defaultNow().notNull(),
}, (table) => [
  uniqueIndex("workflow_experiment_assignments_enrollment_step_uidx").on(table.organizationId, table.enrollmentId, table.stepIndex),
  uniqueIndex("workflow_experiment_assignments_org_id_uidx").on(table.organizationId, table.id),
  index("workflow_experiment_assignments_workflow_idx").on(table.organizationId, table.workflowId, table.experimentKey, table.variantId),
]);


// ─── Production Foundation ───────────────────────────────────────────────────

export const organizationMemberships = pgTable("organization_memberships", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: uuid("organization_id").references(() => organizations.id).notNull(),
  userId: uuid("user_id").references(() => users.id).notNull(),
  role: userRoleEnum("role").default("member").notNull(),
  status: text("status").default("active").notNull(),
  version: integer("version").default(1).notNull(),
  joinedAt: timestamp("joined_at").defaultNow().notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => [
  uniqueIndex("organization_memberships_org_user_uidx").on(table.organizationId, table.userId),
  index("organization_memberships_user_idx").on(table.userId),
  index("organization_memberships_org_status_idx").on(table.organizationId, table.status),
]);

export const organizationInvitations = pgTable("organization_invitations", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: uuid("organization_id").references(() => organizations.id).notNull(),
  email: text("email").notNull(),
  name: text("name"),
  role: userRoleEnum("role").default("member").notNull(),
  tokenHash: text("token_hash").notNull().unique(),
  invitedByUserId: uuid("invited_by_user_id").references(() => users.id),
  status: text("status").default("pending").notNull(),
  expiresAt: timestamp("expires_at").notNull(),
  acceptedAt: timestamp("accepted_at"),
  revokedAt: timestamp("revoked_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => [
  index("organization_invitations_org_email_idx").on(table.organizationId, table.email),
  index("organization_invitations_status_expiry_idx").on(table.status, table.expiresAt),
]);

export const authSessions = pgTable("auth_sessions", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: uuid("organization_id").references(() => organizations.id).notNull(),
  userId: uuid("user_id").references(() => users.id).notNull(),
  membershipId: uuid("membership_id").references(() => organizationMemberships.id).notNull(),
  membershipVersion: integer("membership_version").notNull(),
  userAuthVersion: integer("user_auth_version").notNull(),
  ipHash: text("ip_hash"),
  userAgentHash: text("user_agent_hash"),
  expiresAt: timestamp("expires_at").notNull(),
  revokedAt: timestamp("revoked_at"),
  lastSeenAt: timestamp("last_seen_at").defaultNow().notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => [
  index("auth_sessions_user_idx").on(table.userId),
  index("auth_sessions_org_idx").on(table.organizationId),
  index("auth_sessions_expiry_idx").on(table.expiresAt),
]);

export const auditEvents = pgTable("audit_events", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: uuid("organization_id").references(() => organizations.id),
  actorUserId: uuid("actor_user_id").references(() => users.id),
  actorType: text("actor_type").default("user").notNull(),
  action: text("action").notNull(),
  targetType: text("target_type"),
  targetId: text("target_id"),
  result: text("result").default("success").notNull(),
  requestId: text("request_id"),
  ipHash: text("ip_hash"),
  userAgentHash: text("user_agent_hash"),
  metadata: jsonb("metadata").default({}),
  occurredAt: timestamp("occurred_at").defaultNow().notNull(),
}, (table) => [
  index("audit_events_org_time_idx").on(table.organizationId, table.occurredAt),
  index("audit_events_actor_time_idx").on(table.actorUserId, table.occurredAt),
  index("audit_events_action_idx").on(table.action),
]);

export const integrationSecrets = pgTable("integration_secrets", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: uuid("organization_id").references(() => organizations.id).notNull(),
  provider: text("provider").notNull(),
  ciphertext: text("ciphertext").notNull(),
  iv: text("iv").notNull(),
  authTag: text("auth_tag").notNull(),
  keyVersion: integer("key_version").default(1).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  rotatedAt: timestamp("rotated_at"),
}, (table) => [index("integration_secrets_org_provider_idx").on(table.organizationId, table.provider)]);

export const connectorAccounts = pgTable("connector_accounts", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: uuid("organization_id").references(() => organizations.id).notNull(),
  provider: text("provider").notNull(),
  externalAccountId: text("external_account_id"),
  displayName: text("display_name"),
  status: text("status").default("disconnected").notNull(),
  healthStatus: text("health_status").default("unknown").notNull(),
  scopes: text("scopes").array().default([]).notNull(),
  secretId: uuid("secret_id").references(() => integrationSecrets.id),
  lastVerifiedAt: timestamp("last_verified_at"),
  lastSyncAt: timestamp("last_sync_at"),
  lastError: text("last_error"),
  metadata: jsonb("metadata").default({}),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => [
  uniqueIndex("connector_accounts_org_provider_uidx").on(table.organizationId, table.provider),
  index("connector_accounts_health_idx").on(table.healthStatus),
]);

export const apiKeys = pgTable("api_keys", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: uuid("organization_id").references(() => organizations.id).notNull(),
  createdByUserId: uuid("created_by_user_id").references(() => users.id),
  name: text("name").notNull(),
  prefix: text("prefix").notNull(),
  keyHash: text("key_hash").notNull().unique(),
  scopes: text("scopes").array().default([]).notNull(),
  lastUsedAt: timestamp("last_used_at"),
  expiresAt: timestamp("expires_at"),
  revokedAt: timestamp("revoked_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => [index("api_keys_org_idx").on(table.organizationId)]);

export const webhookEndpoints = pgTable("webhook_endpoints", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: uuid("organization_id").references(() => organizations.id).notNull(),
  url: text("url").notNull(),
  events: text("events").array().default([]).notNull(),
  secretId: uuid("secret_id").references(() => integrationSecrets.id).notNull(),
  active: boolean("active").default(true).notNull(),
  healthStatus: text("health_status").default("pending").notNull(),
  consecutiveFailures: integer("consecutive_failures").default(0).notNull(),
  lastDeliveryAt: timestamp("last_delivery_at"),
  lastSuccessAt: timestamp("last_success_at"),
  lastFailureAt: timestamp("last_failure_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => [index("webhook_endpoints_org_idx").on(table.organizationId)]);

export const webhookDeliveries = pgTable("webhook_deliveries", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: uuid("organization_id").references(() => organizations.id).notNull(),
  endpointId: uuid("endpoint_id").references(() => webhookEndpoints.id).notNull(),
  eventId: uuid("event_id").notNull(),
  eventType: text("event_type").notNull(),
  payload: jsonb("payload").notNull(),
  idempotencyKey: text("idempotency_key").notNull(),
  status: text("status").default("pending").notNull(),
  attemptCount: integer("attempt_count").default(0).notNull(),
  nextAttemptAt: timestamp("next_attempt_at").defaultNow().notNull(),
  responseStatus: integer("response_status"),
  responseBody: text("response_body"),
  lastError: text("last_error"),
  deliveredAt: timestamp("delivered_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => [
  uniqueIndex("webhook_deliveries_endpoint_event_uidx").on(table.endpointId, table.eventId),
  index("webhook_deliveries_due_idx").on(table.status, table.nextAttemptAt),
]);

export const integrationEventReceipts = pgTable("integration_event_receipts", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: uuid("organization_id").references(() => organizations.id).notNull(),
  provider: text("provider").notNull(),
  externalEventId: text("external_event_id").notNull(),
  eventType: text("event_type").notNull(),
  status: text("status").default("received").notNull(),
  error: text("error"),
  receivedAt: timestamp("received_at").defaultNow().notNull(),
  processedAt: timestamp("processed_at"),
}, (table) => [
  uniqueIndex("integration_event_receipts_provider_event_uidx").on(table.organizationId, table.provider, table.externalEventId),
  index("integration_event_receipts_org_time_idx").on(table.organizationId, table.receivedAt),
]);

export const apiRateLimits = pgTable("api_rate_limits", {
  key: text("key").primaryKey(),
  windowStart: timestamp("window_start").notNull(),
  count: integer("count").default(0).notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const emailTrackingEvents = pgTable("email_tracking_events", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: uuid("organization_id").references(() => organizations.id).notNull(),
  campaignId: uuid("campaign_id").references(() => campaigns.id).notNull(),
  recipientHash: text("recipient_hash").notNull(),
  eventType: text("event_type").notNull(),
  targetHash: text("target_hash").default("").notNull(),
  userAgentHash: text("user_agent_hash"),
  ipHash: text("ip_hash"),
  occurredAt: timestamp("occurred_at").defaultNow().notNull(),
}, (table) => [
  uniqueIndex("email_tracking_unique_event_uidx").on(table.campaignId, table.recipientHash, table.eventType, table.targetHash),
  index("email_tracking_campaign_idx").on(table.organizationId, table.campaignId, table.occurredAt),
]);

export const emailDeliveries = pgTable("email_deliveries", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: uuid("organization_id").references(() => organizations.id).notNull(),
  campaignId: uuid("campaign_id").references(() => campaigns.id).notNull(),
  contactId: uuid("contact_id").references(() => contacts.id),
  recipientHash: text("recipient_hash").notNull(),
  provider: text("provider").default("resend").notNull(),
  providerMessageId: text("provider_message_id"),
  status: text("status").default("pending").notNull(),
  idempotencyKey: text("idempotency_key").notNull(),
  attemptCount: integer("attempt_count").default(0).notNull(),
  lastError: text("last_error"),
  acceptedAt: timestamp("accepted_at"),
  deliveredAt: timestamp("delivered_at"),
  failedAt: timestamp("failed_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => [
  uniqueIndex("email_deliveries_idempotency_uidx").on(table.idempotencyKey),
  index("email_deliveries_campaign_idx").on(table.organizationId, table.campaignId, table.createdAt),
  index("email_deliveries_provider_message_idx").on(table.provider, table.providerMessageId),
]);

export const emailSuppressions = pgTable("email_suppressions", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: uuid("organization_id").references(() => organizations.id).notNull(),
  recipientHash: text("recipient_hash").notNull(),
  channel: text("channel").default("email").notNull(),
  reason: text("reason").default("unsubscribe").notNull(),
  source: text("source").default("recipient").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => [
  uniqueIndex("email_suppressions_org_recipient_uidx").on(table.organizationId, table.recipientHash, table.channel),
  index("email_suppressions_org_idx").on(table.organizationId, table.createdAt),
]);

export const contactConsents = pgTable("contact_consents", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: uuid("organization_id").references(() => organizations.id).notNull(),
  contactId: uuid("contact_id").references(() => contacts.id).notNull(),
  channel: text("channel").notNull(),
  purpose: text("purpose").notNull(),
  status: text("status").notNull(),
  lawfulBasis: text("lawful_basis"),
  source: text("source"),
  evidence: jsonb("evidence").default({}),
  effectiveAt: timestamp("effective_at").defaultNow().notNull(),
  expiresAt: timestamp("expires_at"),
  recordedByUserId: uuid("recorded_by_user_id").references(() => users.id),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => [
  index("contact_consents_contact_idx").on(table.organizationId, table.contactId),
  index("contact_consents_lookup_idx").on(table.organizationId, table.channel, table.purpose, table.effectiveAt),
]);

export const customerSuccessPlaybooks = pgTable("customer_success_playbooks", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: uuid("organization_id").references(() => organizations.id).notNull(),
  name: text("name").notNull(),
  description: text("description"),
  status: text("status").default("draft").notNull(),
  activeVersionId: uuid("active_version_id"),
  createdByUserId: uuid("created_by_user_id").references(() => users.id),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => [
  uniqueIndex("customer_success_playbooks_org_id_uidx").on(table.organizationId, table.id),
  index("customer_success_playbooks_org_status_idx").on(table.organizationId, table.status, table.updatedAt),
]);

export const customerSuccessPlaybookVersions = pgTable("customer_success_playbook_versions", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: uuid("organization_id").references(() => organizations.id).notNull(),
  playbookId: uuid("playbook_id").references(() => customerSuccessPlaybooks.id).notNull(),
  version: integer("version").notNull(),
  definition: jsonb("definition").notNull(),
  checksum: text("checksum").notNull(),
  status: text("status").default("draft").notNull(),
  createdByUserId: uuid("created_by_user_id").references(() => users.id),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  publishedAt: timestamp("published_at"),
}, (table) => [
  uniqueIndex("customer_success_playbook_versions_number_uidx").on(table.organizationId, table.playbookId, table.version),
  uniqueIndex("customer_success_playbook_versions_checksum_uidx").on(table.organizationId, table.playbookId, table.checksum),
]);

export const customerSuccessPlans = pgTable("customer_success_plans", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: uuid("organization_id").references(() => organizations.id).notNull(),
  contactId: uuid("contact_id").references(() => contacts.id).notNull(),
  name: text("name").notNull(),
  status: text("status").default("active").notNull(),
  playbookVersionId: uuid("playbook_version_id").references(() => customerSuccessPlaybookVersions.id),
  ownerUserId: uuid("owner_user_id").references(() => users.id),
  objectives: jsonb("objectives").default([]).notNull(),
  successCriteria: jsonb("success_criteria").default([]).notNull(),
  startDate: timestamp("start_date"),
  targetDate: timestamp("target_date"),
  completedAt: timestamp("completed_at"),
  createdByUserId: uuid("created_by_user_id").references(() => users.id),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => [
  uniqueIndex("customer_success_plans_org_id_uidx").on(table.organizationId, table.id),
  index("customer_success_plans_contact_idx").on(table.organizationId, table.contactId, table.status, table.updatedAt),
]);

export const customerSuccessMilestones = pgTable("customer_success_milestones", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: uuid("organization_id").references(() => organizations.id).notNull(),
  planId: uuid("plan_id").references(() => customerSuccessPlans.id).notNull(),
  title: text("title").notNull(),
  description: text("description"),
  status: text("status").default("pending").notNull(),
  sequence: integer("sequence").default(0).notNull(),
  dueAt: timestamp("due_at"),
  completedAt: timestamp("completed_at"),
  ownerUserId: uuid("owner_user_id").references(() => users.id),
  evidence: jsonb("evidence").default({}).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => [
  uniqueIndex("customer_success_milestones_org_id_uidx").on(table.organizationId, table.id),
  index("customer_success_milestones_plan_idx").on(table.organizationId, table.planId, table.sequence),
  index("customer_success_milestones_due_idx").on(table.organizationId, table.status, table.dueAt),
]);

export const customerRenewals = pgTable("customer_renewals", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: uuid("organization_id").references(() => organizations.id).notNull(),
  contactId: uuid("contact_id").references(() => contacts.id).notNull(),
  subscriptionId: uuid("subscription_id").references(() => subscriptions.id),
  renewalDate: timestamp("renewal_date").notNull(),
  amount: decimal("amount", { precision: 15, scale: 2 }),
  currency: text("currency").default("USD").notNull(),
  status: text("status").default("upcoming").notNull(),
  riskLevel: text("risk_level").default("unknown").notNull(),
  ownerUserId: uuid("owner_user_id").references(() => users.id),
  notes: text("notes"),
  renewedAt: timestamp("renewed_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => [
  index("customer_renewals_due_idx").on(table.organizationId, table.status, table.renewalDate),
  index("customer_renewals_contact_idx").on(table.organizationId, table.contactId, table.renewalDate),
]);

export const customerHealthAssessments = pgTable("customer_health_assessments", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: uuid("organization_id").references(() => organizations.id).notNull(),
  contactId: uuid("contact_id").references(() => contacts.id).notNull(),
  score: decimal("score", { precision: 5, scale: 2 }),
  status: text("status").notNull(),
  components: jsonb("components").default({}).notNull(),
  methodologyVersion: text("methodology_version").notNull(),
  evidenceFrom: timestamp("evidence_from"),
  evidenceTo: timestamp("evidence_to").notNull(),
  calculatedBy: text("calculated_by").default("rules_engine").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => [
  index("customer_health_assessments_contact_idx").on(table.organizationId, table.contactId, table.createdAt),
  index("customer_health_assessments_status_idx").on(table.organizationId, table.status, table.createdAt),
]);

export const customerRiskAlerts = pgTable("customer_risk_alerts", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: uuid("organization_id").references(() => organizations.id).notNull(),
  contactId: uuid("contact_id").references(() => contacts.id).notNull(),
  healthAssessmentId: uuid("health_assessment_id").references(() => customerHealthAssessments.id),
  alertType: text("alert_type").notNull(),
  severity: text("severity").notNull(),
  status: text("status").default("open").notNull(),
  title: text("title").notNull(),
  description: text("description"),
  evidence: jsonb("evidence").default({}).notNull(),
  ownerUserId: uuid("owner_user_id").references(() => users.id),
  acknowledgedAt: timestamp("acknowledged_at"),
  resolvedAt: timestamp("resolved_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => [
  uniqueIndex("customer_risk_alerts_assessment_type_uidx").on(table.organizationId, table.healthAssessmentId, table.alertType),
  index("customer_risk_alerts_open_idx").on(table.organizationId, table.status, table.severity, table.createdAt),
]);

export const loyaltyPrograms = pgTable("loyalty_programs", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: uuid("organization_id").references(() => organizations.id).notNull(),
  name: text("name").notNull(),
  description: text("description"),
  status: text("status").default("draft").notNull(),
  activeVersionId: uuid("active_version_id"),
  createdByUserId: uuid("created_by_user_id").references(() => users.id),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => [
  uniqueIndex("loyalty_programs_org_id_uidx").on(table.organizationId, table.id),
  index("loyalty_programs_org_status_idx").on(table.organizationId, table.status, table.updatedAt),
]);

export const loyaltyProgramVersions = pgTable("loyalty_program_versions", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: uuid("organization_id").references(() => organizations.id).notNull(),
  programId: uuid("program_id").references(() => loyaltyPrograms.id).notNull(),
  version: integer("version").notNull(),
  definition: jsonb("definition").notNull(),
  checksum: text("checksum").notNull(),
  status: text("status").default("draft").notNull(),
  createdByUserId: uuid("created_by_user_id").references(() => users.id),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  publishedAt: timestamp("published_at"),
}, (table) => [
  uniqueIndex("loyalty_program_versions_number_uidx").on(table.organizationId, table.programId, table.version),
  uniqueIndex("loyalty_program_versions_checksum_uidx").on(table.organizationId, table.programId, table.checksum),
  uniqueIndex("loyalty_program_versions_org_id_uidx").on(table.organizationId, table.id),
]);

export const loyaltyTiers = pgTable("loyalty_tiers", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: uuid("organization_id").references(() => organizations.id).notNull(),
  programVersionId: uuid("program_version_id").references(() => loyaltyProgramVersions.id).notNull(),
  name: text("name").notNull(),
  minimumLifetimePoints: integer("minimum_lifetime_points").default(0).notNull(),
  benefits: jsonb("benefits").default([]).notNull(),
  sequence: integer("sequence").default(0).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => [
  uniqueIndex("loyalty_tiers_name_uidx").on(table.organizationId, table.programVersionId, table.name),
  uniqueIndex("loyalty_tiers_org_id_uidx").on(table.organizationId, table.id),
]);

export const loyaltyAccounts = pgTable("loyalty_accounts", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: uuid("organization_id").references(() => organizations.id).notNull(),
  programId: uuid("program_id").references(() => loyaltyPrograms.id).notNull(),
  contactId: uuid("contact_id").references(() => contacts.id).notNull(),
  currentBalance: integer("current_balance").default(0).notNull(),
  lifetimeEarned: integer("lifetime_earned").default(0).notNull(),
  lifetimeRedeemed: integer("lifetime_redeemed").default(0).notNull(),
  currentTierId: uuid("current_tier_id").references(() => loyaltyTiers.id),
  status: text("status").default("active").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => [
  uniqueIndex("loyalty_accounts_contact_program_uidx").on(table.organizationId, table.programId, table.contactId),
  uniqueIndex("loyalty_accounts_org_id_uidx").on(table.organizationId, table.id),
]);

export const loyaltyPointTransactions = pgTable("loyalty_point_transactions", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: uuid("organization_id").references(() => organizations.id).notNull(),
  accountId: uuid("account_id").references(() => loyaltyAccounts.id).notNull(),
  programVersionId: uuid("program_version_id").references(() => loyaltyProgramVersions.id).notNull(),
  transactionType: text("transaction_type").notNull(),
  points: integer("points").notNull(),
  status: text("status").default("posted").notNull(),
  sourceType: text("source_type").notNull(),
  sourceId: text("source_id"),
  description: text("description"),
  idempotencyKey: text("idempotency_key").notNull(),
  relatedTransactionId: uuid("related_transaction_id"),
  metadata: jsonb("metadata").default({}).notNull(),
  createdByUserId: uuid("created_by_user_id").references(() => users.id),
  occurredAt: timestamp("occurred_at").defaultNow().notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => [
  uniqueIndex("loyalty_point_transactions_idempotency_uidx").on(table.organizationId, table.idempotencyKey),
  uniqueIndex("loyalty_point_transactions_org_id_uidx").on(table.organizationId, table.id),
  index("loyalty_point_transactions_account_idx").on(table.organizationId, table.accountId, table.occurredAt),
]);

export const customerReferrals = pgTable("customer_referrals", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: uuid("organization_id").references(() => organizations.id).notNull(),
  programId: uuid("program_id").references(() => loyaltyPrograms.id).notNull(),
  referrerContactId: uuid("referrer_contact_id").references(() => contacts.id).notNull(),
  referredContactId: uuid("referred_contact_id").references(() => contacts.id),
  referralCodeHash: text("referral_code_hash").notNull(),
  referralCodeHint: text("referral_code_hint").notNull(),
  status: text("status").default("pending").notNull(),
  qualificationEvent: text("qualification_event"),
  qualifiedAt: timestamp("qualified_at"),
  rewardedAt: timestamp("rewarded_at"),
  rewardTransactionId: uuid("reward_transaction_id").references(() => loyaltyPointTransactions.id),
  metadata: jsonb("metadata").default({}).notNull(),
  createdByUserId: uuid("created_by_user_id").references(() => users.id),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => [
  uniqueIndex("customer_referrals_code_uidx").on(table.organizationId, table.referralCodeHash),
  uniqueIndex("customer_referrals_org_id_uidx").on(table.organizationId, table.id),
  index("customer_referrals_referrer_idx").on(table.organizationId, table.programId, table.referrerContactId, table.status),
]);

export const loyaltyFraudReviews = pgTable("loyalty_fraud_reviews", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: uuid("organization_id").references(() => organizations.id).notNull(),
  transactionId: uuid("transaction_id").references(() => loyaltyPointTransactions.id),
  referralId: uuid("referral_id").references(() => customerReferrals.id),
  riskLevel: text("risk_level").notNull(),
  status: text("status").default("open").notNull(),
  reasonCodes: jsonb("reason_codes").default([]).notNull(),
  evidence: jsonb("evidence").default({}).notNull(),
  assignedUserId: uuid("assigned_user_id").references(() => users.id),
  resolutionNotes: text("resolution_notes"),
  resolvedAt: timestamp("resolved_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => [
  index("loyalty_fraud_reviews_open_idx").on(table.organizationId, table.status, table.riskLevel, table.createdAt),
]);

export const contactIdentityKeys = pgTable("contact_identity_keys", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: uuid("organization_id").references(() => organizations.id).notNull(),
  contactId: uuid("contact_id").references(() => contacts.id).notNull(),
  identityType: text("identity_type").notNull(),
  valueHash: text("value_hash").notNull(),
  displayHint: text("display_hint"),
  source: text("source").default("manual").notNull(),
  verified: boolean("verified").default(false).notNull(),
  active: boolean("active").default(true).notNull(),
  firstSeenAt: timestamp("first_seen_at").defaultNow().notNull(),
  lastSeenAt: timestamp("last_seen_at").defaultNow().notNull(),
}, (table) => [
  uniqueIndex("contact_identity_keys_org_type_hash_uidx").on(table.organizationId, table.identityType, table.valueHash),
  index("contact_identity_keys_contact_idx").on(table.organizationId, table.contactId, table.active),
]);

export const identityResolutionCandidates = pgTable("identity_resolution_candidates", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: uuid("organization_id").references(() => organizations.id).notNull(),
  leftContactId: uuid("left_contact_id").references(() => contacts.id).notNull(),
  rightContactId: uuid("right_contact_id").references(() => contacts.id).notNull(),
  identityType: text("identity_type").notNull(),
  identityHash: text("identity_hash").notNull(),
  reason: text("reason").notNull(),
  confidence: decimal("confidence", { precision: 5, scale: 2 }).notNull(),
  status: text("status").default("pending").notNull(),
  evidence: jsonb("evidence").default({}).notNull(),
  reviewedByUserId: uuid("reviewed_by_user_id").references(() => users.id),
  reviewedAt: timestamp("reviewed_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => [
  uniqueIndex("identity_resolution_candidates_pair_uidx").on(table.organizationId, table.leftContactId, table.rightContactId, table.identityType, table.identityHash),
  index("identity_resolution_candidates_org_status_idx").on(table.organizationId, table.status, table.createdAt),
]);

export const contactRelationships = pgTable("contact_relationships", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: uuid("organization_id").references(() => organizations.id).notNull(),
  fromContactId: uuid("from_contact_id").references(() => contacts.id).notNull(),
  toContactId: uuid("to_contact_id").references(() => contacts.id).notNull(),
  relationshipType: text("relationship_type").notNull(),
  status: text("status").default("active").notNull(),
  metadata: jsonb("metadata").default({}).notNull(),
  validFrom: timestamp("valid_from"),
  validUntil: timestamp("valid_until"),
  createdByUserId: uuid("created_by_user_id").references(() => users.id),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => [
  uniqueIndex("contact_relationships_unique_edge_uidx").on(table.organizationId, table.fromContactId, table.toContactId, table.relationshipType),
  index("contact_relationships_from_idx").on(table.organizationId, table.fromContactId, table.status),
  index("contact_relationships_to_idx").on(table.organizationId, table.toContactId, table.status),
]);

export const contactLifecycleHistory = pgTable("contact_lifecycle_history", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: uuid("organization_id").references(() => organizations.id).notNull(),
  contactId: uuid("contact_id").references(() => contacts.id).notNull(),
  fromStage: text("from_stage"),
  toStage: text("to_stage").notNull(),
  reason: text("reason"),
  source: text("source").default("manual").notNull(),
  actorUserId: uuid("actor_user_id").references(() => users.id),
  occurredAt: timestamp("occurred_at").defaultNow().notNull(),
}, (table) => [index("contact_lifecycle_history_contact_idx").on(table.organizationId, table.contactId, table.occurredAt)]);

export const customerTimelineEvents = pgTable("customer_timeline_events", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: uuid("organization_id").references(() => organizations.id).notNull(),
  contactId: uuid("contact_id").references(() => contacts.id).notNull(),
  sourceType: text("source_type").notNull(),
  sourceId: text("source_id"),
  eventType: text("event_type").notNull(),
  summary: text("summary").notNull(),
  metadata: jsonb("metadata").default({}).notNull(),
  actorUserId: uuid("actor_user_id").references(() => users.id),
  idempotencyKey: text("idempotency_key").notNull(),
  occurredAt: timestamp("occurred_at").defaultNow().notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => [
  uniqueIndex("customer_timeline_events_idempotency_uidx").on(table.organizationId, table.idempotencyKey),
  index("customer_timeline_events_contact_idx").on(table.organizationId, table.contactId, table.occurredAt),
]);

export const operationalEvents = pgTable("operational_events", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: uuid("organization_id").references(() => organizations.id).notNull(),
  severity: text("severity").notNull(),
  component: text("component").notNull(),
  event: text("event").notNull(),
  requestId: text("request_id"),
  errorCode: text("error_code"),
  message: text("message").notNull(),
  metadata: jsonb("metadata").default({}).notNull(),
  occurredAt: timestamp("occurred_at").defaultNow().notNull(),
}, (table) => [
  index("operational_events_org_time_idx").on(table.organizationId, table.occurredAt),
  index("operational_events_org_severity_idx").on(table.organizationId, table.severity, table.occurredAt),
  index("operational_events_component_idx").on(table.component, table.event, table.occurredAt),
]);


// ─── Segmentation and Personalization ─────────────────────────────────────────

export const customerSegments = pgTable("customer_segments", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: uuid("organization_id").references(() => organizations.id).notNull(),
  name: text("name").notNull(),
  description: text("description"),
  status: text("status").default("draft").notNull(),
  definition: jsonb("definition").default({ combinator: "and", conditions: [] }).notNull(),
  version: integer("version").default(1).notNull(),
  createdByUserId: uuid("created_by_user_id").references(() => users.id),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => [
  uniqueIndex("customer_segments_org_name_uidx").on(table.organizationId, table.name),
  uniqueIndex("customer_segments_org_id_uidx").on(table.organizationId, table.id),
]);

export const customerSegmentVersions = pgTable("customer_segment_versions", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: uuid("organization_id").references(() => organizations.id).notNull(),
  segmentId: uuid("segment_id").references(() => customerSegments.id).notNull(),
  version: integer("version").notNull(),
  definition: jsonb("definition").notNull(),
  checksum: text("checksum").notNull(),
  status: text("status").default("draft").notNull(),
  createdByUserId: uuid("created_by_user_id").references(() => users.id),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  publishedAt: timestamp("published_at"),
}, (table) => [
  uniqueIndex("customer_segment_versions_number_uidx").on(table.organizationId, table.segmentId, table.version),
  uniqueIndex("customer_segment_versions_checksum_uidx").on(table.organizationId, table.segmentId, table.checksum),
  uniqueIndex("customer_segment_versions_org_id_uidx").on(table.organizationId, table.id),
]);

export const customerSegmentActiveVersions = pgTable("customer_segment_active_versions", {
  segmentId: uuid("segment_id").primaryKey().references(() => customerSegments.id),
  organizationId: uuid("organization_id").references(() => organizations.id).notNull(),
  versionId: uuid("version_id").references(() => customerSegmentVersions.id).notNull(),
  activatedByUserId: uuid("activated_by_user_id").references(() => users.id),
  activatedAt: timestamp("activated_at").defaultNow().notNull(),
}, (table) => [uniqueIndex("customer_segment_active_versions_org_segment_uidx").on(table.organizationId, table.segmentId)]);

export const personalizationExperiences = pgTable("personalization_experiences", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: uuid("organization_id").references(() => organizations.id).notNull(),
  key: text("key").notNull(),
  name: text("name").notNull(),
  description: text("description"),
  channel: text("channel").notNull(),
  segmentId: uuid("segment_id").references(() => customerSegments.id),
  status: text("status").default("draft").notNull(),
  definition: jsonb("definition").notNull(),
  version: integer("version").default(1).notNull(),
  startsAt: timestamp("starts_at"),
  endsAt: timestamp("ends_at"),
  createdByUserId: uuid("created_by_user_id").references(() => users.id),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => [
  uniqueIndex("personalization_experiences_org_key_uidx").on(table.organizationId, table.key),
  uniqueIndex("personalization_experiences_org_id_uidx").on(table.organizationId, table.id),
]);

export const personalizationExperienceVersions = pgTable("personalization_experience_versions", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: uuid("organization_id").references(() => organizations.id).notNull(),
  experienceId: uuid("experience_id").references(() => personalizationExperiences.id).notNull(),
  version: integer("version").notNull(),
  definition: jsonb("definition").notNull(),
  checksum: text("checksum").notNull(),
  status: text("status").default("draft").notNull(),
  createdByUserId: uuid("created_by_user_id").references(() => users.id),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  publishedAt: timestamp("published_at"),
}, (table) => [
  uniqueIndex("personalization_experience_versions_number_uidx").on(table.organizationId, table.experienceId, table.version),
  uniqueIndex("personalization_experience_versions_checksum_uidx").on(table.organizationId, table.experienceId, table.checksum),
  uniqueIndex("personalization_experience_versions_org_id_uidx").on(table.organizationId, table.id),
]);

export const personalizationActiveVersions = pgTable("personalization_active_versions", {
  experienceId: uuid("experience_id").primaryKey().references(() => personalizationExperiences.id),
  organizationId: uuid("organization_id").references(() => organizations.id).notNull(),
  versionId: uuid("version_id").references(() => personalizationExperienceVersions.id).notNull(),
  activatedByUserId: uuid("activated_by_user_id").references(() => users.id),
  activatedAt: timestamp("activated_at").defaultNow().notNull(),
}, (table) => [uniqueIndex("personalization_active_versions_org_experience_uidx").on(table.organizationId, table.experienceId)]);

export const personalizationAssignments = pgTable("personalization_assignments", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: uuid("organization_id").references(() => organizations.id).notNull(),
  experienceId: uuid("experience_id").references(() => personalizationExperiences.id).notNull(),
  experienceVersionId: uuid("experience_version_id").references(() => personalizationExperienceVersions.id).notNull(),
  contactId: uuid("contact_id").references(() => contacts.id),
  subjectKeyHash: text("subject_key_hash").notNull(),
  variantId: text("variant_id").notNull(),
  variantName: text("variant_name").notNull(),
  eligible: boolean("eligible").notNull(),
  eligibilityReason: text("eligibility_reason").notNull(),
  payload: jsonb("payload").default({}).notNull(),
  assignedAt: timestamp("assigned_at").defaultNow().notNull(),
  lastEvaluatedAt: timestamp("last_evaluated_at").defaultNow().notNull(),
}, (table) => [
  uniqueIndex("personalization_assignments_subject_uidx").on(table.organizationId, table.experienceId, table.experienceVersionId, table.subjectKeyHash),
  uniqueIndex("personalization_assignments_org_id_uidx").on(table.organizationId, table.id),
  index("personalization_assignments_experience_idx").on(table.organizationId, table.experienceId, table.variantId, table.assignedAt),
]);

// ─── Release validation evidence ─────────────────────────────────────────────

export const releaseValidationEvents = pgTable("release_validation_events", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: uuid("organization_id").references(() => organizations.id).notNull(),
  controlKey: text("control_key").notNull(),
  action: text("action").notNull(),
  result: text("result"),
  environment: text("environment").notNull(),
  summary: text("summary").notNull(),
  evidenceReference: text("evidence_reference"),
  evidence: jsonb("evidence").default({}).notNull(),
  targetEventId: uuid("target_event_id"),
  idempotencyKey: text("idempotency_key").notNull(),
  expiresAt: timestamp("expires_at"),
  createdByUserId: uuid("created_by_user_id").references(() => users.id),
  occurredAt: timestamp("occurred_at").defaultNow().notNull(),
}, (table) => [
  uniqueIndex("release_validation_events_org_id_uidx").on(table.organizationId, table.id),
  uniqueIndex("release_validation_events_org_idempotency_uidx").on(table.organizationId, table.idempotencyKey),
  index("release_validation_events_control_idx").on(table.organizationId, table.controlKey, table.occurredAt),
]);

// ─── Relations ────────────────────────────────────────────────────────────────

export const organizationsRelations = relations(organizations, ({ many }) => ({
  users: many(users),
  contacts: many(contacts),
  companies: many(companies),
  deals: many(deals),
  campaigns: many(campaigns),
  workflows: many(workflows),
}));

export const contactsRelations = relations(contacts, ({ one, many }) => ({
  organization: one(organizations, {
    fields: [contacts.organizationId],
    references: [organizations.id],
  }),
  company: one(companies, {
    fields: [contacts.companyId],
    references: [companies.id],
  }),
  owner: one(users, {
    fields: [contacts.ownerId],
    references: [users.id],
  }),
  activities: many(activities),
  deals: many(deals),
  tasks: many(tasks),
}));

export const dealsRelations = relations(deals, ({ one, many }) => ({
  organization: one(organizations, {
    fields: [deals.organizationId],
    references: [organizations.id],
  }),
  contact: one(contacts, {
    fields: [deals.contactId],
    references: [contacts.id],
  }),
  company: one(companies, {
    fields: [deals.companyId],
    references: [companies.id],
  }),
  owner: one(users, {
    fields: [deals.ownerId],
    references: [users.id],
  }),
  pipeline: one(pipelines, {
    fields: [deals.pipelineId],
    references: [pipelines.id],
  }),
  activities: many(activities),
}));
