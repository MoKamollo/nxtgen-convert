"use client";
import { Card, CardHeader, CardTitle } from "@/components/ui/Card";
import { StatusBadge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { timeAgo, formatCurrency } from "@/lib/utils";
import { Mail, Phone, Calendar, FileText, MessageSquare, TrendingUp } from "lucide-react";
import { cn } from "@/lib/utils";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { apiFetch, apiUrl } from "@/lib/org";

type ActivityItem = {
  id: string;
  type: string;
  subject: string;
  outcome?: string | null;
  scheduledAt?: string | null;
  completedAt?: string | null;
};

type DealItem = {
  id: string;
  name: string;
  stage: string;
  contact?: string | null;
  probability: number;
  value: number;
};

const activityIcons = {
  email: { icon: Mail, color: "text-blue-400", bg: "bg-blue-500/10" },
  call: { icon: Phone, color: "text-emerald-400", bg: "bg-emerald-500/10" },
  meeting: { icon: Calendar, color: "text-violet-400", bg: "bg-violet-500/10" },
  note: { icon: FileText, color: "text-amber-400", bg: "bg-amber-500/10" },
  sms: { icon: MessageSquare, color: "text-cyan-400", bg: "bg-cyan-500/10" },
};

export function RecentActivityFeed() {
  const router = useRouter();
  const [activities, setActivities] = useState<ActivityItem[]>([]);

  useEffect(() => {
    apiFetch(apiUrl("/api/activities"))
      .then((r) => r.json())
      .then((j) => setActivities(j.data?.slice(0, 5) ?? []));
  }, []);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Recent Activity</CardTitle>
        <Button variant="ghost" size="sm" onClick={() => router.push("/crm/activities")}>View all</Button>
      </CardHeader>
      <div className="space-y-3">
        {activities.map((activity) => {
          const conf = activityIcons[activity.type as keyof typeof activityIcons] || activityIcons.note;
          const Icon = conf.icon;
          return (
            <div key={activity.id} className="flex items-start gap-3 group cursor-pointer rounded-lg px-1 py-2 hover:bg-surface-800/40 -mx-1 transition-colors">
              <div className={cn("flex h-8 w-8 shrink-0 items-center justify-center rounded-lg", conf.bg)}>
                <Icon size={14} className={conf.color} />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-semibold text-surface-200 truncate">{activity.subject}</p>
                <div className="flex items-center gap-1.5 mt-0.5">
                  <span className="text-[11px] text-surface-500">{activity.type}</span>
                </div>
                {activity.outcome && (
                  <p className="text-[11px] text-surface-500 mt-0.5 truncate">{activity.outcome}</p>
                )}
              </div>
              <span className="text-[10px] text-surface-600 shrink-0 mt-0.5">
                {activity.scheduledAt
                  ? `Due ${timeAgo(new Date(activity.scheduledAt))}`
                  : activity.completedAt
                  ? timeAgo(new Date(activity.completedAt))
                  : ""}
              </span>
            </div>
          );
        })}
        {activities.length === 0 && (
          <p className="text-xs text-surface-500 text-center py-4">No recent activity</p>
        )}
      </div>
    </Card>
  );
}

export function TopDeals() {
  const router = useRouter();
  const [deals, setDeals] = useState<DealItem[]>([]);

  useEffect(() => {
    apiFetch(apiUrl("/api/deals"))
      .then((r) => r.json())
      .then((j) => setDeals((j.data ?? []).filter((deal: DealItem) => !["closed_won", "closed_lost"].includes(deal.stage)).slice(0, 4)));
  }, []);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Active Deals</CardTitle>
        <Button variant="ghost" size="sm" onClick={() => router.push("/crm/deals")}>View pipeline</Button>
      </CardHeader>
      <div className="space-y-3">
        {deals.map((deal) => (
          <div key={deal.id} className="flex items-center gap-3 group cursor-pointer rounded-lg px-1 py-2 hover:bg-surface-800/40 -mx-1 transition-colors">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-brand-500/10">
              <TrendingUp size={14} className="text-brand-400" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-semibold text-surface-200 truncate">{deal.name}</p>
              <div className="flex items-center gap-1.5 mt-0.5">
                <span className="text-[11px] text-surface-500">{deal.contact}</span>
                <span className="text-[11px] text-surface-700">·</span>
                <span className="text-[11px] text-surface-600">{deal.probability}%</span>
              </div>
            </div>
            <div className="text-right shrink-0">
              <p className="text-xs font-semibold text-surface-100">{formatCurrency(deal.value)}</p>
              <StatusBadge status={deal.stage} />
            </div>
          </div>
        ))}
        {deals.length === 0 && (
          <p className="text-xs text-surface-500 text-center py-4">No active deals</p>
        )}
      </div>
    </Card>
  );
}
