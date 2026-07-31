"use client";
import { useState } from "react";
import { Sidebar } from "./Sidebar";
import { TopBar } from "./TopBar";

export function AppLayout({ children }: { children: React.ReactNode }) {
  const [collapsed, setCollapsed] = useState(false);

  return (
    <div className="flex h-screen overflow-hidden bg-surface-950">
      <Sidebar collapsed={collapsed} />
      <div className="flex flex-1 flex-col overflow-hidden">
        <TopBar
          collapsed={collapsed}
          onToggleCollapse={() => setCollapsed((c) => !c)}
        />
        <main className="relative flex-1 overflow-y-auto bg-surface-950">
          <div aria-hidden className="pointer-events-none fixed inset-0 z-0" style={{ backgroundImage: "url('/convert-bg.png')", backgroundSize: "cover", backgroundPosition: "center right", opacity: 0.18 }} />
          <div className="relative z-10">
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}
