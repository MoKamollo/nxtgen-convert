"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import {
  ArrowLeft,
  Building2,
  CalendarClock,
  CircleDollarSign,
  Clock3,
  GitBranch,
  Mail,
  Phone,
  ShieldCheck,
  TicketCheck,
  UserRoundCheck,
} from "lucide-react";
import { AppLayout } from "@/components/layout/AppLayout";
import { Card } from "@/components/ui/Card";
import { StatusBadge } from "@/components/ui/Badge";
import { Avatar } from "@/components/ui/Avatar";
import { apiFetch, apiUrl } from "@/lib/org";
import { formatCurrency, timeAgo } from "@/lib/utils";

type TimelineItem = {
  id: string;
  source: string;
  type: string;
  summary: string;
  occurredAt: string;
  metadata: Record<string, unknown>;
};

type ProfileResponse = {
  contact: {
    id: string;
    firstName: string;
    lastName: string | null;
    email: string | null;
    phone: string | null;
    status: string;
    source: string | null;
    companyName: string | null;
    jobTitle: string | null;
    department: string | null;
    tags: string[] | null;
    score: number | null;
    ownerName: string | null;
    createdAt: string;
    archivedAt: string | null;
  };
  identities: Array<{ id: string; type: string; displayHint: string | null; source: string; verified: boolean; active: boolean; lastSeenAt: string }>;
  relationships: Array<{ id: string; fromContactId: string; toContactId: string; relationshipType: string; status: string }>;
  consent: Array<{ id: string; channel: string; purpose: string; status: string; lawfulBasis: string | null; effectiveAt: string; expiresAt: string | null }>;
  lifecycle: Array<{ id: string; fromStage: string | null; toStage: string; source: string; occurredAt: string }>;
  timeline: TimelineItem[];
  summary: {
    paidOrderRevenue: number;
    recurringMrr: number;
    activeSubscriptions: number;
    openDealCount: number;
    openDealValue: number;
    openTicketCount: number;
    pendingTaskCount: number;
  };
  methodology: Record<string, string>;
};

function sourceLabel(value: string) {
  return value.replace(/[_:.]/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export default function ContactProfilePage() {
  const params = useParams<{ id: string }>();
  const [profile, setProfile] = useState<ProfileResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    void Promise.resolve()
      .then(() => {
        if (!active) return null;
        setLoading(true);
        setError("");
        setProfile(null);
        return apiFetch(apiUrl(`/api/contacts/${params.id}/profile`));
      })
      .then(async (response) => {
        if (!response) return;
        const json = await response.json();
        if (!response.ok) throw new Error(json.error ?? "Unable to load customer profile");
        if (active) setProfile(json.data);
      })
      .catch((reason: unknown) => {
        if (active) setError(reason instanceof Error ? reason.message : "Unable to load customer profile");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => { active = false; };
  }, [params.id]);

  return (
    <AppLayout>
      <div className="p-6 space-y-5 animate-fade-in">
        <Link href="/crm/contacts" className="inline-flex items-center gap-1.5 text-xs text-surface-400 hover:text-surface-100">
          <ArrowLeft size={14} /> Back to contacts
        </Link>

        {loading && <Card><p className="text-sm text-surface-400">Loading customer profile…</p></Card>}
        {!loading && error && <Card><p className="text-sm text-red-400">{error}</p></Card>}

        {profile && (
          <>
            <div className="flex items-start justify-between gap-4">
              <div className="flex items-center gap-4 min-w-0">
                <Avatar name={`${profile.contact.firstName} ${profile.contact.lastName ?? ""}`} size="lg" />
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <h1 className="text-2xl font-bold text-surface-50 truncate">
                      {profile.contact.firstName} {profile.contact.lastName}
                    </h1>
                    <StatusBadge status={profile.contact.archivedAt ? "archived" : profile.contact.status} />
                  </div>
                  <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-surface-400">
                    {profile.contact.email && <span className="inline-flex items-center gap-1.5"><Mail size={12} />{profile.contact.email}</span>}
                    {profile.contact.phone && <span className="inline-flex items-center gap-1.5"><Phone size={12} />{profile.contact.phone}</span>}
                    {profile.contact.companyName && <span className="inline-flex items-center gap-1.5"><Building2 size={12} />{profile.contact.companyName}</span>}
                    <span className="inline-flex items-center gap-1.5"><CalendarClock size={12} />Created {timeAgo(profile.contact.createdAt)}</span>
                  </div>
                </div>
              </div>
              <div className="text-right">
                <p className="text-[10px] uppercase tracking-wider text-surface-600">Rule score</p>
                <p className="text-2xl font-bold text-surface-100">{profile.contact.score ?? 0}</p>
                <p className="text-[10px] text-surface-600">Not a prediction</p>
              </div>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3">
              {[
                { label: "Paid orders", value: formatCurrency(profile.summary.paidOrderRevenue), icon: CircleDollarSign },
                { label: "Recurring MRR", value: formatCurrency(profile.summary.recurringMrr), icon: CircleDollarSign },
                { label: "Subscriptions", value: profile.summary.activeSubscriptions, icon: UserRoundCheck },
                { label: "Open deals", value: `${profile.summary.openDealCount} · ${formatCurrency(profile.summary.openDealValue)}`, icon: GitBranch },
                { label: "Open tickets", value: profile.summary.openTicketCount, icon: TicketCheck },
                { label: "Pending tasks", value: profile.summary.pendingTaskCount, icon: Clock3 },
              ].map((item) => (
                <Card key={item.label} padding="sm">
                  <div className="flex items-center gap-2 text-surface-500"><item.icon size={13} /><span className="text-[10px] uppercase tracking-wider">{item.label}</span></div>
                  <p className="mt-2 text-lg font-bold text-surface-100">{item.value}</p>
                </Card>
              ))}
            </div>

            <div className="grid grid-cols-1 xl:grid-cols-[1.65fr_1fr] gap-5">
              <Card>
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <h2 className="text-sm font-semibold text-surface-100">Customer timeline</h2>
                    <p className="text-[11px] text-surface-500 mt-0.5">Recorded events from operational source tables</p>
                  </div>
                  <span className="text-[10px] text-surface-600">{profile.timeline.length} latest events</span>
                </div>
                <div className="space-y-0">
                  {profile.timeline.length === 0 && <p className="text-xs text-surface-500 py-8 text-center">No recorded customer events.</p>}
                  {profile.timeline.map((event, index) => (
                    <div key={event.id} className="relative flex gap-3 pb-4">
                      {index < profile.timeline.length - 1 && <div className="absolute left-[5px] top-4 bottom-0 w-px bg-surface-800" />}
                      <div className="mt-1.5 h-2.5 w-2.5 rounded-full border-2 border-surface-700 bg-surface-950 shrink-0" />
                      <div className="min-w-0 flex-1 border-b border-surface-800/70 pb-3">
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <p className="text-xs font-medium text-surface-200">{event.summary}</p>
                            <p className="text-[10px] text-surface-600 mt-1">{sourceLabel(event.source)} · {sourceLabel(event.type)}</p>
                          </div>
                          <time className="text-[10px] text-surface-600 whitespace-nowrap">{timeAgo(event.occurredAt)}</time>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </Card>

              <div className="space-y-5">
                <Card>
                  <div className="flex items-center gap-2 mb-3"><ShieldCheck size={14} className="text-emerald-400" /><h2 className="text-sm font-semibold text-surface-100">Consent status</h2></div>
                  <div className="space-y-2">
                    {profile.consent.length === 0 && <p className="text-xs text-surface-500">No consent records.</p>}
                    {profile.consent.map((consent) => (
                      <div key={consent.id} className="flex items-center justify-between rounded-lg border border-surface-800 px-3 py-2">
                        <div><p className="text-xs text-surface-200">{sourceLabel(consent.channel)} · {sourceLabel(consent.purpose)}</p><p className="text-[10px] text-surface-600">{consent.lawfulBasis ?? "No lawful basis recorded"}</p></div>
                        <StatusBadge status={consent.status} />
                      </div>
                    ))}
                  </div>
                </Card>

                <Card>
                  <h2 className="text-sm font-semibold text-surface-100 mb-3">Canonical identities</h2>
                  <div className="space-y-2">
                    {profile.identities.filter((identity) => identity.active).length === 0 && <p className="text-xs text-surface-500">No canonical identity keys recorded.</p>}
                    {profile.identities.filter((identity) => identity.active).map((identity) => (
                      <div key={identity.id} className="flex items-center justify-between rounded-lg bg-surface-900 px-3 py-2">
                        <div><p className="text-xs text-surface-200">{sourceLabel(identity.type)}</p><p className="text-[10px] font-mono text-surface-500">{identity.displayHint}</p></div>
                        <span className="text-[10px] text-surface-500">{identity.verified ? "Verified" : "Unverified"}</span>
                      </div>
                    ))}
                  </div>
                </Card>

                <Card>
                  <h2 className="text-sm font-semibold text-surface-100 mb-3">Lifecycle history</h2>
                  <div className="space-y-2">
                    {profile.lifecycle.length === 0 && <p className="text-xs text-surface-500">No lifecycle changes recorded.</p>}
                    {profile.lifecycle.slice(0, 8).map((item) => (
                      <div key={item.id} className="flex items-center justify-between text-xs">
                        <span className="text-surface-300">{sourceLabel(item.fromStage ?? "unclassified")} → {sourceLabel(item.toStage)}</span>
                        <span className="text-[10px] text-surface-600">{timeAgo(item.occurredAt)}</span>
                      </div>
                    ))}
                  </div>
                </Card>

                <Card>
                  <h2 className="text-sm font-semibold text-surface-100 mb-3">Relationships</h2>
                  {profile.relationships.length === 0
                    ? <p className="text-xs text-surface-500">No customer relationships recorded.</p>
                    : <div className="space-y-2">{profile.relationships.map((item) => <div key={item.id} className="text-xs text-surface-300">{sourceLabel(item.relationshipType)} · {item.status}</div>)}</div>}
                </Card>
              </div>
            </div>
          </>
        )}
      </div>
    </AppLayout>
  );
}
