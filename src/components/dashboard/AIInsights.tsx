"use client";
import { Card, CardHeader, CardTitle } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Avatar } from "@/components/ui/Avatar";
import { TrendingUp, AlertTriangle, Zap, ArrowUpRight, ListChecks, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { apiFetch, apiUrl } from "@/lib/org";

type Insight = {
  id: string; type: "opportunity" | "churn" | "expansion" | "campaign";
  title: string; body: string; priority: string;
  contact?: string; impact?: string; action: string; contactIds?: string[];
};

const typeConfig = {
  opportunity: { icon: TrendingUp,    color: "text-emerald-400", bg: "bg-emerald-500/10", border: "border-emerald-500/20", badge: "success"  as const, label: "Lead Follow-up" },
  churn:       { icon: AlertTriangle, color: "text-red-400",     bg: "bg-red-500/10",     border: "border-red-500/20",     badge: "danger"   as const, label: "Recent Churn" },
  expansion:   { icon: ArrowUpRight,  color: "text-brand-400",   bg: "bg-brand-500/10",   border: "border-brand-500/20",   badge: "info"     as const, label: "Expansion Candidate" },
  campaign:    { icon: Zap,           color: "text-amber-400",   bg: "bg-amber-500/10",   border: "border-amber-500/20",   badge: "warning"  as const, label: "Follow-up" },
};

const INSIGHT_ROUTES: Record<string, string> = {
  churn:       "/crm/contacts?status=churned",
  opportunity: "/crm/deals",
  expansion:   "/crm/contacts?status=vip",
  campaign:    "/email/campaigns",
};

export function AIInsightsPanel() {
  const router = useRouter();
  const [insights, setInsights] = useState<Insight[]>([]);
  const [dismissed, setDismissed] = useState<string[]>([]);

  useEffect(() => {
    apiFetch(apiUrl("/api/ai-insights")).then(r => r.json())
      .then(j => setInsights(j.data ?? []))
      .catch(() => setInsights([]));
  }, []);

  const visible = insights.filter(i => !dismissed.includes(i.id));

  return (
    <Card className="col-span-full">
      <CardHeader>
        <div className="flex items-center gap-2">
          <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-brand-500/15">
            <ListChecks size={14} className="text-brand-400" />
          </div>
          <CardTitle>Operational Signals</CardTitle>
          {visible.length > 0 && <Badge variant="purple" size="sm">{visible.length} active</Badge>}
        </div>
        <Button variant="ghost" size="sm" onClick={() => router.push("/ai/insights")}>View all signals</Button>
      </CardHeader>

      {visible.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-8 text-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-emerald-500/10 mb-3">
            <ListChecks size={20} className="text-emerald-400" />
          </div>
          <p className="text-sm font-semibold text-surface-200">No active signals</p>
          <p className="text-xs text-surface-500 mt-1">Rule-based signals will appear when current records meet documented conditions</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
          {visible.map(insight => {
            const config = typeConfig[insight.type] ?? typeConfig.opportunity;
            const Icon = config.icon;
            return (
              <div key={insight.id} className={cn("relative rounded-xl border p-4 transition-all duration-200 hover:scale-[1.01]", config.bg, config.border)}>
                <button onClick={() => setDismissed(d => [...d, insight.id])}
                  className="absolute top-3 right-3 text-surface-600 hover:text-surface-400 transition-colors">
                  <X size={13} />
                </button>
                <div className="flex items-center gap-2 mb-3">
                  <div className={cn("flex h-7 w-7 items-center justify-center rounded-lg", config.bg)}>
                    <Icon size={14} className={config.color} />
                  </div>
                  <Badge variant={config.badge} size="sm">{config.label}</Badge>
                  {insight.priority === "high" && <Badge variant="danger" size="sm">High</Badge>}
                </div>
                <h4 className="text-xs font-semibold text-surface-100 leading-tight mb-2">{insight.title}</h4>
                <p className="text-[11px] text-surface-400 leading-relaxed mb-3 line-clamp-3">{insight.body}</p>
                {insight.contact && (
                  <div className="flex items-center gap-1.5 mb-3">
                    <Avatar name={insight.contact} size="xs" />
                    <span className="text-[11px] text-surface-400">{insight.contact}</span>
                  </div>
                )}
                {insight.impact && <div className="text-xs font-semibold text-emerald-400 mb-3">{insight.impact}</div>}
                <button
                  onClick={() => router.push(INSIGHT_ROUTES[insight.type] ?? "/crm/contacts")}
                  className={cn("w-full flex items-center justify-center gap-1.5 rounded-lg py-1.5 text-xs font-semibold transition-all", config.bg, config.color, "hover:opacity-80")}
                >
                  <ListChecks size={12} />{insight.action}
                </button>
              </div>
            );
          })}
        </div>
      )}
    </Card>
  );
}
