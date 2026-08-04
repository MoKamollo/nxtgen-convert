"use client";
import { AppLayout } from "@/components/layout/AppLayout";
import { Rocket } from "lucide-react";

interface ComingSoonProps {
  feature: string;
  description?: string;
}

export function ComingSoon({ feature, description }: ComingSoonProps) {
  return (
    <AppLayout>
      <div className="flex flex-col items-center justify-center h-full min-h-[60vh] text-center p-8">
        <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-brand-500/10 mb-5">
          <Rocket size={28} className="text-brand-400" />
        </div>
        <h1 className="text-2xl font-bold text-surface-50 mb-2">{feature}</h1>
        <p className="text-sm text-surface-400 max-w-sm">
          {description ?? "This feature is coming soon. We're building it as part of the NxtGen Convergence roadmap."}
        </p>
        <div className="mt-6 inline-flex items-center gap-2 rounded-lg bg-brand-500/10 border border-brand-500/20 px-4 py-2">
          <span className="h-1.5 w-1.5 rounded-full bg-brand-400 animate-pulse" />
          <span className="text-xs font-medium text-brand-400">In development</span>
        </div>
      </div>
    </AppLayout>
  );
}
