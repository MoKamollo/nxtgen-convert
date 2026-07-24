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
  organizationId: uuid("organization_id").references(() => organizations.id),
  email: text("email").notNull().unique(),
  name: text("name").notNull(),
  avatar: text("avatar"),
  role: userRoleEnum("role").default("member"),
  jobTitle: text("job_title"),
  phone: text("phone"),
  timezone: text("timezone").default("America/New_York"),
  preferences: jsonb("preferences").default({}),
  lastActiveAt: timestamp("last_active_at"),
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
