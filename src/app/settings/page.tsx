"use client";
import { AppLayout } from "@/components/layout/AppLayout";
import { Avatar } from "@/components/ui/Avatar";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Input, Select } from "@/components/ui/Input";
import { cn } from "@/lib/utils";
import { apiFetch, apiUrl } from "@/lib/org";
import {
  User, Building2, Shield, Bell, Key, Plug, CreditCard,
  Palette, Code, Users, Check, Zap, Mail, MessageSquare,
  Calendar, Database, Webhook, Loader2, Plus, X, Trash2, TrendingUp,
} from "lucide-react";
import { useState, useEffect, useCallback } from "react";
import { ConfirmAction, Modal, Toast } from "@/components/modules/ModulePrimitives";

type OrgMember = {
  id: string; name: string; email: string; role: string;
  jobTitle: string | null; avatar: string | null; lastActiveAt: string | null;
};

type OrgData = {
  id: string; name: string; slug: string; website: string | null;
  industry: string | null; size: string | null; plan: string;
  members: OrgMember[];
  settings?: { integrations?: Record<string, boolean>; [key: string]: unknown };
};

type UserData = {
  tenantId: string; role: string | null;
  org: { id: string; name: string; plan: string } | null;
  user: { id: string; name: string; email: string; jobTitle: string | null; avatar: string | null; phone?: string | null; timezone?: string | null; preferences?: { notifications?: NotificationPreferences; appearance?: AppearancePreferences } } | null;
};


type NotificationPreferences = { email: Record<string, boolean>; inApp: Record<string, boolean> };
type AppearancePreferences = { density: "comfortable" | "compact"; reduceMotion: boolean };
type ApiKeyItem = { id: string; name: string; maskedKey: string; scopes?: string[]; createdAt: string; lastUsedAt?: string | null };
type WebhookItem = { id: string; url: string; events: string[]; active: boolean; healthStatus: string; consecutiveFailures: number; createdAt: string };
type IntegrationStatus = { status: string; healthStatus: string; displayName?: string | null; lastVerifiedAt?: string | null; lastSyncAt?: string | null; lastError?: string | null; requirements?: string[] };
const NOTIFICATION_EVENTS = [
  ["contactCreated", "New contact created"], ["dealStageChanged", "Deal stage changed"], ["dealWon", "Deal won"],
  ["taskDue", "Task due in 24h"], ["campaignSent", "Campaign sent"], ["ticketResolved", "Ticket resolved"], ["weeklySummary", "Weekly summary"],
] as const;
const defaultNotifications = (): NotificationPreferences => ({
  email: Object.fromEntries(NOTIFICATION_EVENTS.map(([key]) => [key, true])),
  inApp: Object.fromEntries(NOTIFICATION_EVENTS.map(([key]) => [key, true])),
});

const SETTINGS_SECTIONS = [
  { id: "profile",       label: "Profile",       icon: User },
  { id: "organization",  label: "Organization",  icon: Building2 },
  { id: "team",          label: "Team Members",  icon: Users },
  { id: "growth",        label: "Growth & CAC",  icon: TrendingUp },
  { id: "billing",       label: "Billing & Plans", icon: CreditCard },
  { id: "notifications", label: "Notifications", icon: Bell },
  { id: "security",      label: "Security",      icon: Shield },
  { id: "api",           label: "API & Webhooks", icon: Code },
  { id: "integrations",  label: "Integrations",  icon: Plug },
  { id: "appearance",    label: "Appearance",    icon: Palette },
];

const INTEGRATIONS = [
  { name: "Gmail",            icon: Mail,         connected: false, category: "Email" },
  { name: "Outlook",          icon: Mail,         connected: false, category: "Email" },
  { name: "Slack",            icon: MessageSquare,connected: false, category: "Communication" },
  { name: "Google Calendar",  icon: Calendar,     connected: false, category: "Calendar" },
  { name: "Stripe",           icon: CreditCard,   connected: false, category: "Payments" },
  { name: "Zapier",           icon: Zap,          connected: false, category: "Automation" },
  { name: "PostgreSQL",       icon: Database,     connected: false, category: "Database" },
  { name: "Webhooks",         icon: Webhook,      connected: false, category: "Developer" },
];

const CURRENT_MONTH = new Date().toISOString().slice(0, 7);

const PLAN_LABELS: Record<string, { name: string; color: string }> = {
  starter:      { name: "Starter",      color: "text-surface-300" },
  professional: { name: "Professional", color: "text-brand-400" },
  enterprise:   { name: "Enterprise",   color: "text-violet-400" },
  unlimited:    { name: "Unlimited",    color: "text-emerald-400" },
};

export default function SettingsPage() {
  const [activeSection, setActiveSection] = useState("profile");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [loadingUser, setLoadingUser] = useState(true);
  const [loadingOrg, setLoadingOrg] = useState(false);

  const [userData, setUserData] = useState<UserData | null>(null);
  const [orgData, setOrgData] = useState<OrgData | null>(null);

  const [profileForm, setProfileForm] = useState({ name: "", email: "", jobTitle: "", phone: "", timezone: "America/New_York" });
  const [orgForm, setOrgForm] = useState({ name: "", website: "", industry: "", size: "" });
  const [showInvite, setShowInvite] = useState(false);
  const [inviteForm, setInviteForm] = useState({ name: "", email: "", role: "member" });
  const [inviting, setInviting] = useState(false);
  const [inviteResult, setInviteResult] = useState<string | null>(null);
  const [editMemberId, setEditMemberId] = useState<string | null>(null);
  const [editMemberRole, setEditMemberRole] = useState("");

  type SpendRow = { id: string; month: string; channel: string; amount: string; notes: string | null };
  const [spendRows, setSpendRows] = useState<SpendRow[]>([]);
  const [spendForm, setSpendForm] = useState({ month: CURRENT_MONTH, channel: "other", amount: "", notes: "" });
  const [addingSpend, setAddingSpend] = useState(false);
  const [contactCount, setContactCount] = useState<number | null>(null);
  const [emailsSentMonth, setEmailsSentMonth] = useState<number | null>(null);

  const [apiKeys, setApiKeys] = useState<ApiKeyItem[]>([]);
  const [webhooks, setWebhooks] = useState<WebhookItem[]>([]);
  const [showKeyModal, setShowKeyModal] = useState(false);
  const [keyName, setKeyName] = useState("Default");
  const [newKey, setNewKey] = useState("");
  const [newWebhookSecret, setNewWebhookSecret] = useState("");
  const [webhookForm, setWebhookForm] = useState({ url: "", events: ["contact.created", "deal.won"] });
  const [passwordForm, setPasswordForm] = useState({ currentPassword: "", newPassword: "", confirmPassword: "" });
  const [integrationModal, setIntegrationModal] = useState<string | null>(null);
  const [stripeForm, setStripeForm] = useState({ secretKey: "", publishableKey: "", webhookSecret: "" });
  const [integrationStatuses, setIntegrationStatuses] = useState<Record<string, IntegrationStatus>>({});
  const [showPlanModal, setShowPlanModal] = useState(false);
  const [notifications, setNotifications] = useState<NotificationPreferences>(defaultNotifications);
  const [appearance, setAppearance] = useState<AppearancePreferences>({ density: "comfortable", reduceMotion: false });
  const [actionError, setActionError] = useState("");
  const [toast, setToast] = useState("");

  useEffect(() => {
    apiFetch(apiUrl("/api/users/me"))
      .then(r => r.json())
      .then(data => {
        setUserData(data);
        if (data.user) {
          setProfileForm({
            name:     data.user.name     ?? "",
            email:    data.user.email    ?? "",
            jobTitle: data.user.jobTitle ?? "",
            phone:    data.user.phone    ?? "",
            timezone: data.user.timezone ?? "America/New_York",
          });
          if (data.user.preferences?.notifications) setNotifications(data.user.preferences.notifications);
          if (data.user.preferences?.appearance) setAppearance(data.user.preferences.appearance);
        }
        setLoadingUser(false);
      })
      .catch(() => setLoadingUser(false));
  }, []);

  useEffect(() => {
    if (activeSection === "growth") {
      apiFetch(apiUrl("/api/marketing-spend"))
        .then(r => r.json())
        .then(j => setSpendRows(j.data ?? []));
    }
    if (activeSection === "billing" && contactCount === null) {
      // Fetch live contact count and monthly email usage
      apiFetch(apiUrl("/api/contacts"))
        .then(r => r.json())
        .then(j => setContactCount((j.data ?? []).length))
        .catch(() => {});
      const currentMonth = new Date().toISOString().slice(0, 7);
      apiFetch(apiUrl("/api/campaigns"))
        .then(r => r.json())
        .then(j => {
          const sent = (j.data ?? [])
            .filter((c: { sentAt: string | null; stats: { sent: number } }) =>
              c.sentAt && c.sentAt.startsWith(currentMonth)
            )
            .reduce((s: number, c: { stats: { sent: number } }) => s + (c.stats?.sent ?? 0), 0);
          setEmailsSentMonth(sent);
        })
        .catch(() => {});
    }
  }, [activeSection, contactCount]);

  useEffect(() => {
    if (!["organization", "team", "billing", "integrations"].includes(activeSection) || orgData) return;
    let active = true;
    void Promise.resolve()
      .then(() => {
        if (!active) return null;
        setLoadingOrg(true);
        return apiFetch(apiUrl("/api/org"));
      })
      .then(async (response) => response ? response.json() : null)
      .then((payload) => {
        if (!active || !payload) return;
        setOrgData(payload.data);
        setOrgForm({
          name: payload.data.name ?? "",
          website: payload.data.website ?? "",
          industry: payload.data.industry ?? "",
          size: payload.data.size ?? "",
        });
      })
      .finally(() => {
        if (active) setLoadingOrg(false);
      });
    return () => { active = false; };
  }, [activeSection, orgData]);

  const loadDeveloperSettings = useCallback(async () => {
    try {
      const [keysResponse, hooksResponse] = await Promise.all([apiFetch(apiUrl("/api/api-keys")), apiFetch(apiUrl("/api/webhooks"))]);
      const [keysJson, hooksJson] = await Promise.all([keysResponse.json(), hooksResponse.json()]);
      if (!keysResponse.ok) throw new Error(keysJson.error);
      if (!hooksResponse.ok) throw new Error(hooksJson.error);
      setApiKeys(keysJson.data ?? []); setWebhooks(hooksJson.data ?? []);
    } catch (error) { setActionError(error instanceof Error ? error.message : "Failed to load developer settings"); }
  }, []);

  useEffect(() => { if (activeSection === "api") void Promise.resolve().then(loadDeveloperSettings); }, [activeSection, loadDeveloperSettings]);

  async function updatePassword() {
    setActionError("");
    if (passwordForm.newPassword !== passwordForm.confirmPassword) { setActionError("New passwords do not match"); return; }
    setSaving(true);
    try {
      const response = await apiFetch(apiUrl("/api/users/password"), { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(passwordForm) });
      const json = await response.json(); if (!response.ok) throw new Error(json.error);
      setPasswordForm({ currentPassword: "", newPassword: "", confirmPassword: "" }); setToast("Password updated");
    } catch (error) { setActionError(error instanceof Error ? error.message : "Password update failed"); } finally { setSaving(false); }
  }

  async function generateKey() {
    setSaving(true); setActionError("");
    try { const response = await apiFetch(apiUrl("/api/api-keys"), { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: keyName }) }); const json = await response.json(); if (!response.ok) throw new Error(json.error); setNewKey(json.data.key); setShowKeyModal(false); setToast("API key generated"); await loadDeveloperSettings(); }
    catch (error) { setActionError(error instanceof Error ? error.message : "Key generation failed"); } finally { setSaving(false); }
  }
  async function revokeKey(id: string) { const response = await apiFetch(apiUrl(`/api/api-keys/${id}`), { method: "DELETE" }); const json = await response.json(); if (!response.ok) { setActionError(json.error); return; } setToast("API key revoked"); await loadDeveloperSettings(); }
  async function saveWebhook() {
    setSaving(true); setActionError(""); try { const response = await apiFetch(apiUrl("/api/webhooks"), { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(webhookForm) }); const json = await response.json(); if (!response.ok) throw new Error(json.error); setWebhookForm({ url: "", events: ["contact.created", "deal.won"] }); setNewWebhookSecret(json.data?.signingSecret ?? ""); setToast("Webhook created"); await loadDeveloperSettings(); } catch (error) { setActionError(error instanceof Error ? error.message : "Webhook save failed"); } finally { setSaving(false); }
  }
  async function revokeWebhook(id: string) { const response = await apiFetch(apiUrl(`/api/webhooks/${id}`), { method: "DELETE" }); const json = await response.json(); if (!response.ok) { setActionError(json.error); return; } setToast("Webhook removed"); await loadDeveloperSettings(); }
  const loadIntegrationStatuses = useCallback(async () => {
    const entries = await Promise.all(INTEGRATIONS.map(async integration => {
      const slug = integration.name.toLowerCase().replace(/\s+/g, "-");
      const path = integration.name === "Stripe" ? "/api/integrations/stripe" : `/api/integrations/${slug}`;
      const response = await apiFetch(apiUrl(path));
      const json = await response.json().catch(() => ({}));
      return [slug, { ...(json.data ?? { status: "disconnected", healthStatus: "not_configured" }), requirements: json.requirements ?? [] }] as const;
    }));
    setIntegrationStatuses(Object.fromEntries(entries));
  }, []);

  useEffect(() => { if (activeSection === "integrations") void Promise.resolve().then(loadIntegrationStatuses); }, [activeSection, loadIntegrationStatuses]);

  async function connectIntegration(name: string) {
    if (name !== "Stripe") return;
    setSaving(true); setActionError("");
    try {
      const response = await apiFetch(apiUrl("/api/integrations/stripe"), { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(stripeForm) });
      const json = await response.json();
      if (!response.ok) throw new Error(json.error);
      setIntegrationModal(null);
      setStripeForm({ secretKey: "", publishableKey: "", webhookSecret: "" });
      setToast(`Stripe credentials verified. ${json.nextAction ?? "Webhook validation remains required."}`);
      await loadIntegrationStatuses();
    } catch (error) { setActionError(error instanceof Error ? error.message : "Integration update failed"); } finally { setSaving(false); }
  }
  async function saveNotifications(next: NotificationPreferences) { setNotifications(next); const response = await apiFetch(apiUrl("/api/users/me"), { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ notifications: next }) }); if (!response.ok) { const json = await response.json(); setActionError(json.error); } else setToast("Notification preferences saved"); }
  async function saveAppearance(next: AppearancePreferences) { setAppearance(next); document.documentElement.setAttribute("data-density", next.density); document.documentElement.classList.toggle("reduce-motion", next.reduceMotion); const response = await apiFetch(apiUrl("/api/users/me"), { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ appearance: next }) }); if (!response.ok) { const json = await response.json(); setActionError(json.error); } else setToast("Appearance saved"); }

  async function saveProfile(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    await apiFetch(apiUrl("/api/users/me"), {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: profileForm.name, jobTitle: profileForm.jobTitle, phone: profileForm.phone, timezone: profileForm.timezone }),
    });
    setSaving(false); setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  async function saveOrg(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    await apiFetch(apiUrl("/api/org"), {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: orgForm.name, website: orgForm.website, industry: orgForm.industry, size: orgForm.size }),
    });
    setSaving(false); setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  async function handleInvite(e: React.FormEvent) {
    e.preventDefault();
    setInviting(true); setInviteResult(null);
    const res = await apiFetch(apiUrl("/api/team/invite"), {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify(inviteForm),
    });
    const json = await res.json();
    if (!res.ok) {
      setInviteResult("error:" + (json.error ?? "Failed to invite"));
    } else {
      setInviteResult("success:" + inviteForm.email);
      setInviteForm({ name: "", email: "", role: "member" });
      setOrgData(null);
    }
    setInviting(false);
  }

  async function handleRoleChange(memberId: string, role: string) {
    await apiFetch(apiUrl(`/api/team/${memberId}`), {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ role }),
    });
    setEditMemberId(null);
    setOrgData(null);
  }

  async function handleRemoveMember(memberId: string) {
    await apiFetch(apiUrl(`/api/team/${memberId}`), { method: "DELETE" });
    setOrgData(null);
  }

  async function handleAddSpend(e: React.FormEvent) {
    e.preventDefault();
    if (!spendForm.amount) return;
    setAddingSpend(true);
    const res = await apiFetch(apiUrl("/api/marketing-spend"), {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify(spendForm),
    });
    if (res.ok) {
      const j = await res.json();
      setSpendRows(prev => [...prev, j.data]);
      setSpendForm(f => ({ ...f, amount: "", notes: "" }));
    }
    setAddingSpend(false);
  }

  async function handleDeleteSpend(id: string) {
    await apiFetch(apiUrl(`/api/marketing-spend/${id}`), { method: "DELETE" });
    setSpendRows(prev => prev.filter(r => r.id !== id));
  }

  const planInfo = PLAN_LABELS[orgData?.plan ?? userData?.org?.plan ?? "starter"] ?? PLAN_LABELS.starter;

  return (
    <AppLayout>
      <div className="flex h-[calc(100vh-3.5rem)] animate-fade-in">
        {/* Settings Nav */}
        <aside className="w-56 shrink-0 border-r border-surface-800 p-3 space-y-0.5">
          <p className="text-[10px] font-semibold text-surface-600 uppercase tracking-wider px-2 mb-2">Settings</p>
          {SETTINGS_SECTIONS.map(section => {
            const Icon = section.icon;
            return (
              <button key={section.id} onClick={() => setActiveSection(section.id)}
                className={cn("w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-xs transition-all", activeSection === section.id ? "bg-brand-500/10 text-brand-400 font-medium" : "text-surface-500 hover:text-surface-300 hover:bg-surface-800/40")}>
                <Icon size={14} className="shrink-0" />
                {section.label}
              </button>
            );
          })}
        </aside>

        {/* Content */}
        <div className="flex-1 overflow-y-auto">
          <div className="max-w-2xl mx-auto p-6 space-y-6">

            {/* Profile */}
            {activeSection === "profile" && (
              <div className="space-y-5">
                <div>
                  <h2 className="text-lg font-bold text-surface-50">Profile Settings</h2>
                  <p className="text-sm text-surface-500 mt-0.5">Update your personal information</p>
                </div>

                {loadingUser ? (
                  <div className="flex items-center justify-center py-12"><Loader2 size={20} className="animate-spin text-surface-500" /></div>
                ) : (
                  <form onSubmit={saveProfile}>
                    <div className="rounded-xl border border-surface-800 bg-surface-900/50 p-5 space-y-4">
                      <div className="flex items-center gap-4">
                        <Avatar name={profileForm.name || "User"} size="2xl" />
                        <p className="text-xs text-surface-500">Profile initials are derived from your saved name.</p>
                      </div>
                      <Input label="Full Name" value={profileForm.name} onChange={e => setProfileForm(f => ({ ...f, name: e.target.value }))} />
                      <Input label="Email Address" type="email" value={profileForm.email} readOnly className="opacity-60 cursor-not-allowed" />
                      <Input label="Job Title" value={profileForm.jobTitle} onChange={e => setProfileForm(f => ({ ...f, jobTitle: e.target.value }))} placeholder="e.g. Head of Revenue" />
                      <Input label="Phone Number" type="tel" value={profileForm.phone} onChange={e => setProfileForm(f => ({ ...f, phone: e.target.value }))} placeholder="+1 (555) 000-0000" />
                      <Select label="Timezone" value={profileForm.timezone} onChange={e => setProfileForm(f => ({ ...f, timezone: e.target.value }))}
                        options={[
                          { value: "America/New_York",    label: "Eastern Time (ET)" },
                          { value: "America/Chicago",     label: "Central Time (CT)" },
                          { value: "America/Denver",      label: "Mountain Time (MT)" },
                          { value: "America/Los_Angeles", label: "Pacific Time (PT)" },
                          { value: "Europe/London",       label: "London (GMT)" },
                          { value: "Europe/Paris",        label: "Paris (CET)" },
                        ]} />
                    </div>
                    <div className="mt-4">
                      <Button type="submit" variant="gradient" loading={saving} icon={saved ? Check : undefined}>
                        {saved ? "Saved!" : "Save Changes"}
                      </Button>
                    </div>
                  </form>
                )}
              </div>
            )}

            {/* Organization */}
            {activeSection === "organization" && (
              <div className="space-y-5">
                <div>
                  <h2 className="text-lg font-bold text-surface-50">Organization</h2>
                  <p className="text-sm text-surface-500 mt-0.5">Manage your workspace settings</p>
                </div>

                {loadingOrg ? (
                  <div className="flex items-center justify-center py-12"><Loader2 size={20} className="animate-spin text-surface-500" /></div>
                ) : (
                  <form onSubmit={saveOrg}>
                    <div className="rounded-xl border border-surface-800 bg-surface-900/50 p-5 space-y-4">
                      <div className="flex items-center gap-4">
                        <div className="flex h-14 w-14 items-center justify-center rounded-xl gradient-brand">
                          <span className="text-white font-black text-lg">
                            {(orgForm.name || "O").charAt(0).toUpperCase()}
                          </span>
                        </div>
                        <p className="text-xs text-surface-500">Workspace identity uses the saved organization name.</p>
                      </div>
                      <Input label="Organization Name" value={orgForm.name} onChange={e => setOrgForm(f => ({ ...f, name: e.target.value }))} />
                      <Input label="Website" type="url" value={orgForm.website} onChange={e => setOrgForm(f => ({ ...f, website: e.target.value }))} placeholder="https://yourcompany.com" />
                      <div className="grid grid-cols-2 gap-4">
                        <Select label="Industry" value={orgForm.industry} onChange={e => setOrgForm(f => ({ ...f, industry: e.target.value }))}
                          options={[
                            { value: "",             label: "Select industry" },
                            { value: "technology",   label: "Technology" },
                            { value: "saas",         label: "SaaS" },
                            { value: "ecommerce",    label: "E-Commerce" },
                            { value: "finance",      label: "Finance" },
                            { value: "healthcare",   label: "Healthcare" },
                            { value: "other",        label: "Other" },
                          ]} />
                        <Select label="Company Size" value={orgForm.size} onChange={e => setOrgForm(f => ({ ...f, size: e.target.value }))}
                          options={[
                            { value: "",       label: "Select size" },
                            { value: "1-10",   label: "1-10 employees" },
                            { value: "11-50",  label: "11-50 employees" },
                            { value: "51-200", label: "51-200 employees" },
                            { value: "201-500",label: "201-500 employees" },
                            { value: "500+",   label: "500+ employees" },
                          ]} />
                      </div>
                    </div>
                    <div className="mt-4">
                      <Button type="submit" variant="gradient" loading={saving} icon={saved ? Check : undefined}>
                        {saved ? "Saved!" : "Save Changes"}
                      </Button>
                    </div>
                  </form>
                )}
              </div>
            )}

            {/* Team */}
            {activeSection === "team" && (
              <div className="space-y-5">
                <div className="flex items-center justify-between">
                  <div>
                    <h2 className="text-lg font-bold text-surface-50">Team Members</h2>
                    <p className="text-sm text-surface-500 mt-0.5">Manage access and permissions</p>
                  </div>
                  <Button variant="gradient" size="sm" icon={Plus}
                    onClick={() => { setShowInvite(true); setInviteResult(null); }}>
                    Invite Member
                  </Button>
                </div>

                {loadingOrg ? (
                  <div className="flex items-center justify-center py-12"><Loader2 size={20} className="animate-spin text-surface-500" /></div>
                ) : !orgData?.members?.length ? (
                  <div className="rounded-xl border border-surface-800 bg-surface-900/50 p-8 flex flex-col items-center justify-center gap-2 text-center">
                    <Users size={24} className="text-surface-600" />
                    <p className="text-sm text-surface-400">No team members yet</p>
                    <p className="text-xs text-surface-600">Invite your team to get started</p>
                  </div>
                ) : (
                  <div className="rounded-xl border border-surface-800 bg-surface-900/50 overflow-hidden">
                    <div className="divide-y divide-surface-800/60">
                      {orgData.members.map(member => (
                        <div key={member.id} className="flex items-center gap-3 px-4 py-3.5">
                          <Avatar name={member.name} size="md" status="online" />
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-semibold text-surface-100">{member.name}</p>
                            <p className="text-xs text-surface-500">{member.jobTitle ?? member.email}</p>
                          </div>
                          <Badge variant={member.role === "owner" || member.role === "admin" ? "purple" : "ghost"} size="sm">
                            {member.role.charAt(0).toUpperCase() + member.role.slice(1)}
                          </Badge>
                          {member.role !== "owner" ? (
                            editMemberId === member.id ? (
                              <div className="flex items-center gap-2">
                                <select value={editMemberRole} onChange={e => setEditMemberRole(e.target.value)}
                                  className="h-7 rounded-md border border-surface-700 bg-surface-800 px-2 text-xs text-surface-100 focus:outline-none focus:border-brand-500">
                                  {["admin","manager","member","viewer"].map(r => (
                                    <option key={r} value={r}>{r.charAt(0).toUpperCase()+r.slice(1)}</option>
                                  ))}
                                </select>
                                <button onClick={() => handleRoleChange(member.id, editMemberRole)}
                                  className="text-[11px] text-brand-400 hover:text-brand-300 font-medium">Save</button>
                                <button onClick={() => setEditMemberId(null)}
                                  className="text-[11px] text-surface-500 hover:text-surface-300">Cancel</button>
                              </div>
                            ) : (
                              <div className="flex items-center gap-1">
                                <button onClick={() => { setEditMemberId(member.id); setEditMemberRole(member.role); }}
                                  className="text-xs text-surface-400 hover:text-surface-200 px-2 py-1 rounded hover:bg-surface-800/60 transition-colors">
                                  Edit
                                </button>
                                <button onClick={() => handleRemoveMember(member.id)}
                                  className="p-1.5 rounded text-surface-600 hover:text-red-400 hover:bg-red-500/10 transition-colors">
                                  <Trash2 size={12} />
                                </button>
                              </div>
                            )
                          ) : (
                            <span className="text-xs text-surface-600 px-2">—</span>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Billing */}
            {activeSection === "billing" && (
              <div className="space-y-5">
                <div><h2 className="text-lg font-bold text-surface-50">Billing & Plans</h2><p className="text-sm text-surface-500 mt-0.5">Manage your subscription</p></div>
                {loadingOrg ? <div className="flex items-center justify-center py-8"><Loader2 size={20} className="animate-spin text-surface-500" /></div> : <>
                  <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/8 p-5">
                    <div className="flex items-center justify-between"><div><div className="flex items-center gap-2"><p className={`text-sm font-bold ${planInfo.color}`}>{planInfo.name} Plan</p><Badge variant="success" size="sm" dot>Active</Badge></div><p className="text-xs text-surface-400 mt-0.5">Your subscription is managed through NxtGen Space</p></div><Button variant="outline" size="sm" onClick={() => setShowPlanModal(true)}>Change Plan</Button></div>
                    <div className="mt-4 grid grid-cols-3 gap-3">{[{ label: "Members", used: orgData?.members?.length ?? "—" },{ label: "Contacts", used: contactCount !== null ? contactCount : "—" },{ label: "Emails/month", used: emailsSentMonth !== null ? emailsSentMonth : "—" }].map(usage => <div key={usage.label} className="rounded-lg bg-surface-900/60 p-3"><p className="text-xs text-surface-500">{usage.label}</p><p className="text-sm font-bold text-surface-100 mt-0.5">{usage.used}</p><p className="text-[11px] text-emerald-400">Unlimited</p></div>)}</div>
                  </div>
                  <div className="rounded-xl border border-surface-800 bg-surface-900/50 p-5"><h3 className="text-sm font-semibold text-surface-200 mb-3">Payment Method</h3><div className="flex flex-col items-center justify-center py-4 gap-2 text-center"><CreditCard size={20} className="text-surface-600" /><p className="text-xs text-surface-500">Billing is managed in your NxtGen Space account</p><Button variant="outline" size="sm" onClick={() => window.open("https://space.nxtgen-stack.com/billing", "_blank", "noopener,noreferrer")}>Open Billing Portal</Button></div></div>
                </>}
              </div>
            )}

            {/* Integrations */}
            {activeSection === "integrations" && (
              <div className="space-y-5">
                <div><h2 className="text-lg font-bold text-surface-50">Integrations</h2><p className="text-sm text-surface-500 mt-0.5">Connect services through secure credentials, Zapier, or webhooks</p></div>
                <div className="grid grid-cols-2 gap-3">{INTEGRATIONS.map(integration => { const Icon = integration.icon; const slug = integration.name.toLowerCase().replace(/\s+/g, "-"); const state = integrationStatuses[slug] ?? { status: "disconnected", healthStatus: "not_configured" }; const connected = state.status === "connected" && state.healthStatus === "healthy"; return <div key={integration.name} className={cn("rounded-xl border p-4 flex items-center gap-3", connected ? "border-emerald-500/20 bg-emerald-500/5" : "border-surface-800 bg-surface-900/50")}><div className={cn("flex h-9 w-9 items-center justify-center rounded-lg", connected ? "bg-emerald-500/15" : "bg-surface-800")}><Icon size={16} className={connected ? "text-emerald-400" : "text-surface-500"} /></div><div className="min-w-0 flex-1"><p className="text-xs font-semibold text-surface-200">{integration.name}</p><p className="text-[11px] text-surface-500">{state.healthStatus.replace(/_/g, " ")}</p>{state.lastError && <p className="mt-1 truncate text-[10px] text-amber-400">{state.lastError}</p>}</div>{connected ? <Badge variant="success" size="sm" dot>Verified</Badge> : <Button variant="outline" size="xs" onClick={() => setIntegrationModal(integration.name)}>{integration.name === "Stripe" ? "Configure" : "Requirements"}</Button>}</div>})}</div>
              </div>
            )}

            {/* API */}
            {activeSection === "api" && (
              <div className="space-y-5">
                <div><h2 className="text-lg font-bold text-surface-50">API & Webhooks</h2><p className="text-sm text-surface-500 mt-0.5">Manage tenant-scoped credentials and event delivery</p></div>
                {actionError && <div className="rounded-lg border border-red-500/20 bg-red-500/10 px-3 py-2 text-xs text-red-400">{actionError}</div>}
                <div className="rounded-xl border border-surface-800 bg-surface-900/50 p-5 space-y-4"><div className="flex items-center justify-between"><h3 className="text-sm font-semibold text-surface-200">API Keys</h3><Button variant="outline" size="sm" icon={Key} onClick={() => { setNewKey(""); setShowKeyModal(true); }}>Generate new key</Button></div>
                  {newKey && <div className="rounded-lg border border-amber-500/20 bg-amber-500/5 p-3"><p className="text-[11px] font-semibold text-amber-300">Copy this key now. It will not be shown again.</p><div className="mt-2 flex gap-2"><code className="min-w-0 flex-1 overflow-x-auto rounded bg-surface-950 px-3 py-2 text-[10px] text-surface-200">{newKey}</code><Button size="sm" onClick={() => { navigator.clipboard.writeText(newKey); setToast("API key copied"); }}>Copy</Button></div></div>}
                  {apiKeys.length === 0 ? <div className="flex flex-col items-center justify-center py-6 gap-2 text-center"><Key size={20} className="text-surface-600"/><p className="text-xs text-surface-400">No API keys have been issued</p></div> : <div className="divide-y divide-surface-800 rounded-lg border border-surface-800">{apiKeys.map(key => <div key={key.id} className="flex items-center gap-3 px-3 py-3"><div className="min-w-0 flex-1"><p className="text-xs font-semibold text-surface-200">{key.name}</p><p className="font-mono text-[10px] text-surface-500">{key.maskedKey}</p></div><span className="text-[10px] text-surface-600">{new Date(key.createdAt).toLocaleDateString("en-US")}</span><ConfirmAction label="Revoke" onConfirm={() => revokeKey(key.id)}/></div>)}</div>}
                </div>
                <div className="rounded-xl border border-surface-800 bg-surface-900/50 p-5 space-y-4"><h3 className="text-sm font-semibold text-surface-200">Webhooks</h3><input type="url" value={webhookForm.url} onChange={e => setWebhookForm(f => ({ ...f, url: e.target.value }))} placeholder="https://your-app.com/webhooks/nxtgen" className="w-full h-9 rounded-lg border border-surface-700 bg-surface-800 px-3 text-sm text-surface-100 placeholder:text-surface-600 focus:outline-none focus:border-brand-500"/><div className="grid grid-cols-2 gap-2">{["contact.created","deal.won","deal.lost","campaign.sent","ticket.resolved","payment.received"].map(event => { const checked = webhookForm.events.includes(event); return <label key={event} className="flex items-center gap-2 cursor-pointer"><input type="checkbox" checked={checked} onChange={() => setWebhookForm(f => ({ ...f, events: checked ? f.events.filter(value => value !== event) : [...f.events, event] }))} className="h-3.5 w-3.5 rounded border-surface-600 bg-surface-800 accent-brand-500"/><span className="font-mono text-[11px] text-surface-400">{event}</span></label>})}</div><Button variant="gradient" size="sm" icon={Webhook} loading={saving} onClick={saveWebhook}>Save webhook</Button>
                  {newWebhookSecret && <div className="rounded-lg border border-amber-500/20 bg-amber-500/5 p-3"><p className="text-[11px] font-semibold text-amber-300">Copy this signing secret now. It will not be shown again.</p><div className="mt-2 flex gap-2"><code className="min-w-0 flex-1 overflow-x-auto rounded bg-surface-950 px-3 py-2 text-[10px] text-surface-200">{newWebhookSecret}</code><Button size="sm" onClick={() => navigator.clipboard.writeText(newWebhookSecret)}>Copy</Button></div></div>}
                  {webhooks.length > 0 && <div className="divide-y divide-surface-800 rounded-lg border border-surface-800">{webhooks.map(hook => <div key={hook.id} className="flex items-center gap-3 px-3 py-3"><div className="min-w-0 flex-1"><p className="truncate text-xs font-medium text-surface-200">{hook.url}</p><p className="mt-1 text-[10px] text-surface-500">{hook.events.join(" · ")}</p></div><Badge variant={hook.active && hook.healthStatus === "healthy" ? "success" : "warning"} size="sm">{hook.active ? hook.healthStatus.replace(/_/g, " ") : "disabled"}</Badge><ConfirmAction label="Remove" onConfirm={() => revokeWebhook(hook.id)}/></div>)}</div>}
                </div>
              </div>
            )}

            {/* Security */}
            {activeSection === "security" && (
              <div className="space-y-5"><div><h2 className="text-lg font-bold text-surface-50">Security</h2><p className="text-sm text-surface-500 mt-0.5">Protect your account</p></div>{actionError && <div className="rounded-lg border border-red-500/20 bg-red-500/10 px-3 py-2 text-xs text-red-400">{actionError}</div>}
                <div className="rounded-xl border border-surface-800 bg-surface-900/50 p-5 space-y-4"><h3 className="text-sm font-semibold text-surface-200">Two-Factor Authentication</h3><div className="flex items-center justify-between"><div><p className="text-xs font-medium text-surface-200">Managed by NxtGen Space</p><a className="text-xs text-brand-400 hover:text-brand-300" target="_blank" rel="noreferrer" href="https://space.nxtgen-stack.com/settings/security">Open Space security settings</a></div><Shield size={18} className="text-surface-600"/></div></div>
                <div className="rounded-xl border border-surface-800 bg-surface-900/50 p-5 space-y-4"><h3 className="text-sm font-semibold text-surface-200">Change Password</h3><input type="password" value={passwordForm.currentPassword} onChange={e => setPasswordForm(f => ({ ...f, currentPassword: e.target.value }))} placeholder="Current Password" className="w-full h-9 rounded-lg border border-surface-700 bg-surface-800 px-3 text-sm text-surface-100 placeholder:text-surface-600 focus:outline-none focus:border-brand-500"/><input type="password" value={passwordForm.newPassword} onChange={e => setPasswordForm(f => ({ ...f, newPassword: e.target.value }))} placeholder="New Password" className="w-full h-9 rounded-lg border border-surface-700 bg-surface-800 px-3 text-sm text-surface-100 placeholder:text-surface-600 focus:outline-none focus:border-brand-500"/><input type="password" value={passwordForm.confirmPassword} onChange={e => setPasswordForm(f => ({ ...f, confirmPassword: e.target.value }))} placeholder="Confirm New Password" className="w-full h-9 rounded-lg border border-surface-700 bg-surface-800 px-3 text-sm text-surface-100 placeholder:text-surface-600 focus:outline-none focus:border-brand-500"/><Button variant="gradient" size="sm" loading={saving} onClick={updatePassword}>Update Password</Button></div>
                <div className="rounded-xl border border-surface-800 bg-surface-900/50 p-5"><h3 className="text-sm font-semibold text-surface-200 mb-3">Active Sessions</h3><div className="flex items-center justify-between rounded-lg border border-surface-800 px-3 py-2.5"><div><p className="text-xs font-medium text-surface-200">Current Session</p><p className="text-[11px] text-surface-500">Active now</p></div><Badge variant="success" size="sm">Current</Badge></div></div>
              </div>
            )}

            {/* Notifications */}
            {activeSection === "notifications" && (
              <div className="space-y-5"><div><h2 className="text-lg font-bold text-surface-50">Notifications</h2><p className="text-sm text-surface-500 mt-0.5">Changes save immediately</p></div>{(["email", "inApp"] as const).map(channel => <div key={channel} className="rounded-xl border border-surface-800 bg-surface-900/50 overflow-hidden"><div className="border-b border-surface-800 px-5 py-3"><h3 className="text-sm font-semibold text-surface-200">{channel === "email" ? "Email Notifications" : "In-App Notifications"}</h3></div><div className="divide-y divide-surface-800">{NOTIFICATION_EVENTS.map(([key, label]) => <div key={key} className="flex items-center justify-between px-5 py-3"><span className="text-xs text-surface-300">{label}</span><button onClick={() => { const next = { ...notifications, [channel]: { ...notifications[channel], [key]: !notifications[channel][key] } }; saveNotifications(next); }} className={cn("relative h-5 w-9 rounded-full transition-colors", notifications[channel][key] ? "bg-brand-500" : "bg-surface-700")}><span className={cn("absolute top-0.5 h-4 w-4 rounded-full bg-white transition-transform", notifications[channel][key] ? "translate-x-4" : "translate-x-0.5")}/></button></div>)}</div></div>)}</div>
            )}

            {/* Growth & CAC */}
            {activeSection === "growth" && (
              <div className="space-y-5">
                <div>
                  <h2 className="text-lg font-bold text-surface-50">Growth & CAC Tracking</h2>
                  <p className="text-sm text-surface-500 mt-0.5">Log monthly marketing spend so the dashboard can calculate your Customer Acquisition Cost in real time.</p>
                </div>

                {/* Add spend form */}
                <div className="rounded-xl border border-surface-800 bg-surface-900/50 p-5 space-y-4">
                  <h3 className="text-sm font-semibold text-surface-200">Log Marketing Spend</h3>
                  <form onSubmit={handleAddSpend} className="space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="text-xs text-surface-400 mb-1 block">Month</label>
                        <input type="month" value={spendForm.month}
                          onChange={e => setSpendForm(f => ({ ...f, month: e.target.value }))}
                          className="w-full h-9 rounded-lg border border-surface-700 bg-surface-800 px-3 text-sm text-surface-100 focus:outline-none focus:border-brand-500" />
                      </div>
                      <div>
                        <label className="text-xs text-surface-400 mb-1 block">Channel</label>
                        <select value={spendForm.channel}
                          onChange={e => setSpendForm(f => ({ ...f, channel: e.target.value }))}
                          className="w-full h-9 rounded-lg border border-surface-700 bg-surface-800 px-3 text-sm text-surface-100 focus:outline-none focus:border-brand-500">
                          {["google_ads","meta_ads","linkedin_ads","content","seo","events","referral","other"].map(c => (
                            <option key={c} value={c}>{c.replace(/_/g, " ").replace(/\b\w/g, l => l.toUpperCase())}</option>
                          ))}
                        </select>
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="text-xs text-surface-400 mb-1 block">Amount (USD)</label>
                        <input type="number" min="0" step="0.01" placeholder="5000" value={spendForm.amount}
                          onChange={e => setSpendForm(f => ({ ...f, amount: e.target.value }))}
                          required
                          className="w-full h-9 rounded-lg border border-surface-700 bg-surface-800 px-3 text-sm text-surface-100 focus:outline-none focus:border-brand-500" />
                      </div>
                      <div>
                        <label className="text-xs text-surface-400 mb-1 block">Notes (optional)</label>
                        <input type="text" placeholder="e.g. Q1 campaign" value={spendForm.notes}
                          onChange={e => setSpendForm(f => ({ ...f, notes: e.target.value }))}
                          className="w-full h-9 rounded-lg border border-surface-700 bg-surface-800 px-3 text-sm text-surface-100 focus:outline-none focus:border-brand-500" />
                      </div>
                    </div>
                    <Button type="submit" variant="gradient" size="sm" icon={Plus} loading={addingSpend}>Add Spend Entry</Button>
                  </form>
                </div>

                {/* Spend history */}
                <div className="rounded-xl border border-surface-800 bg-surface-900/50 overflow-hidden">
                  <div className="px-5 py-3 border-b border-surface-800">
                    <h3 className="text-sm font-semibold text-surface-200">Spend History</h3>
                  </div>
                  {spendRows.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-10 gap-2 text-center">
                      <TrendingUp size={20} className="text-surface-600" />
                      <p className="text-xs text-surface-400">No spend logged yet</p>
                      <p className="text-[11px] text-surface-600">Add your first entry above and CAC will appear on the dashboard</p>
                    </div>
                  ) : (
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="border-b border-surface-800">
                          <th className="px-4 py-2.5 text-left text-[10px] font-semibold text-surface-500 uppercase tracking-wider">Month</th>
                          <th className="px-4 py-2.5 text-left text-[10px] font-semibold text-surface-500 uppercase tracking-wider">Channel</th>
                          <th className="px-4 py-2.5 text-right text-[10px] font-semibold text-surface-500 uppercase tracking-wider">Amount</th>
                          <th className="px-4 py-2.5 text-left text-[10px] font-semibold text-surface-500 uppercase tracking-wider">Notes</th>
                          <th className="px-4 py-2.5" />
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-surface-800/50">
                        {spendRows.map(row => (
                          <tr key={row.id} className="hover:bg-surface-800/30 transition-colors">
                            <td className="px-4 py-3 text-surface-200">{row.month}</td>
                            <td className="px-4 py-3 text-surface-400 capitalize">{row.channel.replace(/_/g, " ")}</td>
                            <td className="px-4 py-3 text-right text-emerald-400 font-semibold">${parseFloat(row.amount).toLocaleString()}</td>
                            <td className="px-4 py-3 text-surface-500">{row.notes ?? "—"}</td>
                            <td className="px-4 py-3 text-right">
                              <button onClick={() => handleDeleteSpend(row.id)} className="text-surface-600 hover:text-red-400 transition-colors">
                                <Trash2 size={13} />
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                      <tfoot>
                        <tr className="border-t border-surface-700 bg-surface-800/30">
                          <td colSpan={2} className="px-4 py-3 text-xs font-semibold text-surface-300">Total</td>
                          <td className="px-4 py-3 text-right text-xs font-bold text-emerald-400">
                            ${spendRows.reduce((s, r) => s + parseFloat(r.amount), 0).toLocaleString()}
                          </td>
                          <td colSpan={2} />
                        </tr>
                      </tfoot>
                    </table>
                  )}
                </div>

                <div className="rounded-xl border border-brand-500/20 bg-brand-500/5 p-4">
                  <p className="text-xs text-brand-300 font-semibold mb-1">How CAC is calculated</p>
                  <p className="text-xs text-surface-400">CAC = total spend this month ÷ new customers acquired this month. New customers are contacts with status &quot;customer&quot; or &quot;vip&quot; created in the current calendar month.</p>
                </div>
              </div>
            )}

            {/* Appearance */}
            {activeSection === "appearance" && (
              <div className="space-y-5"><div><h2 className="text-lg font-bold text-surface-50">Appearance</h2><p className="text-sm text-surface-500 mt-0.5">Adjust information density and motion</p></div><div className="rounded-xl border border-surface-800 bg-surface-900/50 p-5 space-y-5"><div><p className="text-xs font-semibold text-surface-300 mb-3">Layout density</p><div className="grid grid-cols-2 gap-3">{(["comfortable", "compact"] as const).map(value => <button key={value} onClick={() => saveAppearance({ ...appearance, density: value })} className={cn("rounded-xl border p-4 text-left", appearance.density === value ? "border-brand-500 bg-brand-500/10" : "border-surface-700 bg-surface-800/50")}><p className="text-xs font-semibold capitalize text-surface-200">{value}</p><p className="mt-1 text-[11px] text-surface-500">{value === "comfortable" ? "More space between interface elements" : "Fit more data on each screen"}</p></button>)}</div></div><div className="flex items-center justify-between border-t border-surface-800 pt-4"><div><p className="text-xs font-semibold text-surface-200">Reduce motion</p><p className="text-[11px] text-surface-500">Minimize transitions and animated effects</p></div><button onClick={() => saveAppearance({ ...appearance, reduceMotion: !appearance.reduceMotion })} className={cn("relative h-5 w-9 rounded-full", appearance.reduceMotion ? "bg-brand-500" : "bg-surface-700")}><span className={cn("absolute top-0.5 h-4 w-4 rounded-full bg-white transition-transform", appearance.reduceMotion ? "translate-x-4" : "translate-x-0.5")}/></button></div></div></div>
            )}
          </div>
        </div>
      </div>

      <Modal open={showKeyModal} onClose={() => setShowKeyModal(false)} title="Generate API key"><div className="space-y-4 p-5"><Input label="Key name" value={keyName} onChange={e => setKeyName(e.target.value)} placeholder="Production integration"/><div className="flex justify-end gap-2"><Button variant="outline" onClick={() => setShowKeyModal(false)}>Cancel</Button><Button variant="primary" loading={saving} onClick={generateKey}>Generate key</Button></div></div></Modal>
      <Modal open={showPlanModal} onClose={() => setShowPlanModal(false)} title="Change plan" width="max-w-3xl"><div className="p-5"><div className="grid grid-cols-3 gap-3">{[{name:"Starter",price:"$29",desc:"3 funnels · 5k contacts · 10k emails/mo"},{name:"Growth",price:"$79",desc:"Unlimited funnels · 25k contacts · 50k emails/mo",popular:true},{name:"Scale",price:"$199",desc:"100k contacts · 250k emails/mo · A/B testing"},{name:"Agency",price:"$499",desc:"Unlimited workspaces · White-label · SLA"}].map(plan => <div key={plan.name} className={`rounded-xl border p-4 relative ${plan.popular?"border-brand-500 bg-brand-500/5":"border-surface-800 bg-surface-950"}`}>{plan.popular&&<span className="absolute -top-2.5 left-1/2 -translate-x-1/2 rounded-full bg-brand-500 px-2.5 py-0.5 font-mono text-[9px] font-bold text-white tracking-wider">POPULAR</span>}<p className="text-sm font-semibold text-surface-100">{plan.name}</p><p className="mt-2 text-2xl font-bold text-surface-50">{plan.price}<span className="text-xs font-normal text-surface-500">/mo</span></p><p className="mt-1 text-[11px] text-surface-500">{plan.desc}</p><Button className="mt-4" size="sm" fullWidth onClick={() => window.open("https://space.nxtgen-stack.com/billing", "_blank", "noopener,noreferrer")}>Select Plan</Button></div>)}</div><p className="mt-4 text-xs text-surface-500">Plan changes are completed through NxtGen Space billing or by emailing <a className="text-brand-400" href="mailto:hello@nxtgen-stack.com">hello@nxtgen-stack.com</a>.</p></div></Modal>
      <Modal open={!!integrationModal} onClose={() => setIntegrationModal(null)} title={`${integrationModal ?? "Integration"} setup`} width="max-w-lg">{integrationModal === "Stripe" ? <div className="space-y-4 p-5"><p className="text-xs leading-5 text-surface-400">Credentials are verified directly with Stripe before the connector is stored. The webhook remains unverified until Stripe sends a valid signed event.</p><Input label="Secret Key" type="password" value={stripeForm.secretKey} onChange={e => setStripeForm(f => ({ ...f, secretKey: e.target.value }))} placeholder="sk_live_..."/><Input label="Publishable Key" value={stripeForm.publishableKey} onChange={e => setStripeForm(f => ({ ...f, publishableKey: e.target.value }))} placeholder="pk_live_..."/><Input label="Webhook Signing Secret" type="password" value={stripeForm.webhookSecret} onChange={e => setStripeForm(f => ({ ...f, webhookSecret: e.target.value }))} placeholder="whsec_..."/><Button variant="primary" fullWidth loading={saving} onClick={() => connectIntegration("Stripe")}>Verify and save</Button></div> : <div className="space-y-4 p-5"><p className="text-sm leading-6 text-surface-300">This connector is not implemented until its provider authentication and validation requirements are available.</p><div className="rounded-lg border border-surface-800 bg-surface-950 p-3"><p className="text-[11px] font-semibold text-surface-300">Required owner inputs</p><ul className="mt-2 space-y-1 text-[11px] text-surface-500">{(integrationStatuses[(integrationModal ?? "").toLowerCase().replace(/\s+/g, "-")]?.requirements ?? ["Provider application credentials and approval"]).map(item => <li key={item}>• {item}</li>)}</ul></div><Button variant="outline" fullWidth onClick={() => setIntegrationModal(null)}>Close</Button></div>}</Modal>
      {toast && <Toast message={toast}/>}

      {/* Invite Member Modal */}
      {showInvite && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-2xl border border-surface-700 bg-surface-900 shadow-2xl">
            <div className="flex items-center justify-between px-5 py-4 border-b border-surface-800">
              <h3 className="text-sm font-bold text-surface-50">Invite Team Member</h3>
              <button onClick={() => setShowInvite(false)} className="text-surface-500 hover:text-surface-300 transition-colors">
                <X size={16} />
              </button>
            </div>
            <form onSubmit={handleInvite} className="p-5 space-y-4">
              <Input label="Full Name" value={inviteForm.name} required
                onChange={e => setInviteForm(f => ({ ...f, name: e.target.value }))}
                placeholder="Jane Smith" />
              <Input label="Email Address" type="email" value={inviteForm.email} required
                onChange={e => setInviteForm(f => ({ ...f, email: e.target.value }))}
                placeholder="jane@company.com" />
              <Select label="Role" value={inviteForm.role}
                onChange={e => setInviteForm(f => ({ ...f, role: e.target.value }))}
                options={[
                  { value: "admin",   label: "Admin — full access" },
                  { value: "manager", label: "Manager — team & deals" },
                  { value: "member",  label: "Member — standard access" },
                  { value: "viewer",  label: "Viewer — read only" },
                ]} />

              {inviteResult && (
                <div className={cn("rounded-lg px-3 py-2 text-xs font-medium",
                  inviteResult.startsWith("success:") ? "bg-emerald-500/10 text-emerald-400" : "bg-red-500/10 text-red-400")}>
                  {inviteResult.startsWith("success:") ? `Invite sent to ${inviteResult.slice(8)}` : inviteResult.slice(6)}
                </div>
              )}

              <div className="flex gap-2 pt-1">
                <Button type="submit" variant="gradient" loading={inviting} className="flex-1">
                  Send Invite
                </Button>
                <Button type="button" variant="outline" onClick={() => setShowInvite(false)}>Cancel</Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </AppLayout>
  );
}
