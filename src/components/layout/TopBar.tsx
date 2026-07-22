"use client";
import { useState } from "react";
import { cn } from "@/lib/utils";
import { Avatar } from "@/components/ui/Avatar";
import { Badge } from "@/components/ui/Badge";
import { IconButton } from "@/components/ui/Button";
import {
  Search,
  Bell,
  Plus,
  Settings,
  Command,
  ChevronDown,
  PanelLeftClose,
  PanelLeftOpen,
  Sun,
  Moon,
  Zap,
  TrendingUp,
  Users,
  Mail,
} from "lucide-react";
import { formatCurrency } from "@/lib/utils";
import { useSession } from "@/hooks/useSession";

interface TopBarProps {
  collapsed: boolean;
  onToggleCollapse: () => void;
}

export function TopBar({ collapsed, onToggleCollapse }: TopBarProps) {
  const [searchOpen, setSearchOpen] = useState(false);
  const [darkMode, setDarkMode] = useState(true);
  const [notifOpen, setNotifOpen] = useState(false);
  const { session } = useSession();
  const userName = session?.user?.name ?? session?.org?.name ?? "…";

  const notifications = [
    {
      id: 1,
      type: "deal",
      title: "Deal closed — TechCorp Enterprise",
      body: "Sarah Johnson accepted the $84K proposal",
      time: "2m ago",
      read: false,
    },
    {
      id: 2,
      type: "ai",
      title: "AI Alert: Churn risk detected",
      body: "ScaleX AI health score dropped to 41",
      time: "18m ago",
      read: false,
    },
    {
      id: 3,
      type: "campaign",
      title: "Campaign sent successfully",
      body: "Q4 Product Launch — 12,400 emails delivered",
      time: "1h ago",
      read: true,
    },
    {
      id: 4,
      type: "ticket",
      title: "Critical ticket escalated",
      body: "TKT-1039 requires immediate attention",
      time: "2h ago",
      read: true,
    },
  ];

  const unreadCount = notifications.filter((n) => !n.read).length;

  return (
    <header className="h-14 shrink-0 flex items-center gap-3 border-b border-surface-800 bg-surface-950/80 backdrop-blur-sm px-4 z-10">
      {/* Sidebar toggle */}
      <button
        onClick={onToggleCollapse}
        className="text-surface-500 hover:text-surface-300 transition-colors"
        title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
      >
        {collapsed ? <PanelLeftOpen size={18} /> : <PanelLeftClose size={18} />}
      </button>

      {/* Quick stats strip */}
      <div className="hidden lg:flex items-center gap-4 ml-2">
        <div className="flex items-center gap-1.5 text-xs">
          <TrendingUp size={12} className="text-emerald-400" />
          <span className="text-surface-500">MRR</span>
          <span className="font-semibold text-emerald-400">—</span>
        </div>
        <div className="h-3 w-px bg-surface-800" />
        <div className="flex items-center gap-1.5 text-xs">
          <Users size={12} className="text-brand-400" />
          <span className="text-surface-500">Contacts</span>
          <span className="font-semibold text-brand-400">—</span>
        </div>
        <div className="h-3 w-px bg-surface-800" />
        <div className="flex items-center gap-1.5 text-xs">
          <TrendingUp size={12} className="text-violet-400" />
          <span className="text-surface-500">Pipeline</span>
          <span className="font-semibold text-violet-400">—</span>
        </div>
      </div>

      {/* Spacer */}
      <div className="flex-1" />

      {/* Search */}
      <button
        onClick={() => setSearchOpen(true)}
        className={cn(
          "flex items-center gap-2 rounded-lg border border-surface-800 bg-surface-900/50 px-3 h-8",
          "text-xs text-surface-500 hover:text-surface-300 hover:border-surface-700 transition-all",
          "w-48 lg:w-64"
        )}
      >
        <Search size={13} />
        <span className="flex-1 text-left">Search anything...</span>
        <kbd className="hidden sm:flex items-center gap-0.5 text-[10px] text-surface-600 bg-surface-800 rounded px-1 py-0.5">
          <Command size={10} /> K
        </kbd>
      </button>

      {/* Quick create */}
      <button className="flex items-center gap-1.5 rounded-lg gradient-brand h-8 px-3 text-xs font-semibold text-white hover:opacity-90 transition-opacity shadow-sm shadow-brand-500/30">
        <Plus size={14} />
        <span className="hidden sm:inline">Create</span>
      </button>

      {/* Notifications */}
      <div className="relative">
        <button
          onClick={() => setNotifOpen(!notifOpen)}
          className="relative flex h-8 w-8 items-center justify-center rounded-lg text-surface-400 hover:text-surface-200 hover:bg-surface-800/60 transition-all"
        >
          <Bell size={16} />
          {unreadCount > 0 && (
            <span className="absolute -top-0.5 -right-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-red-500 text-[9px] font-bold text-white">
              {unreadCount}
            </span>
          )}
        </button>

        {notifOpen && (
          <>
            <div
              className="fixed inset-0 z-40"
              onClick={() => setNotifOpen(false)}
            />
            <div className="absolute right-0 top-10 z-50 w-80 rounded-xl border border-surface-700 bg-surface-900 shadow-2xl shadow-black/40 animate-slide-in">
              <div className="flex items-center justify-between px-4 py-3 border-b border-surface-800">
                <span className="text-sm font-semibold text-surface-100">
                  Notifications
                </span>
                <Badge variant="danger" size="sm">
                  {unreadCount} new
                </Badge>
              </div>
              <div className="divide-y divide-surface-800">
                {notifications.map((n) => (
                  <div
                    key={n.id}
                    className={cn(
                      "px-4 py-3 hover:bg-surface-800/40 cursor-pointer transition-colors",
                      !n.read && "bg-brand-500/5"
                    )}
                  >
                    <div className="flex items-start gap-2.5">
                      <div
                        className={cn(
                          "flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-white",
                          n.type === "deal" && "bg-emerald-500/20 text-emerald-400",
                          n.type === "ai" && "bg-violet-500/20 text-violet-400",
                          n.type === "campaign" && "bg-brand-500/20 text-brand-400",
                          n.type === "ticket" && "bg-red-500/20 text-red-400"
                        )}
                      >
                        {n.type === "deal" && <TrendingUp size={13} />}
                        {n.type === "ai" && <Zap size={13} />}
                        {n.type === "campaign" && <Mail size={13} />}
                        {n.type === "ticket" && <Settings size={13} />}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-semibold text-surface-200 truncate">
                          {n.title}
                        </p>
                        <p className="text-xs text-surface-500 truncate mt-0.5">
                          {n.body}
                        </p>
                      </div>
                      <span className="text-[10px] text-surface-600 shrink-0 mt-0.5">
                        {n.time}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
              <div className="p-3 border-t border-surface-800">
                <button className="w-full text-center text-xs text-brand-400 hover:text-brand-300 transition-colors">
                  View all notifications
                </button>
              </div>
            </div>
          </>
        )}
      </div>

      {/* Dark mode toggle */}
      <button
        onClick={() => setDarkMode(!darkMode)}
        className="flex h-8 w-8 items-center justify-center rounded-lg text-surface-400 hover:text-surface-200 hover:bg-surface-800/60 transition-all"
      >
        {darkMode ? <Sun size={15} /> : <Moon size={15} />}
      </button>

      {/* User avatar */}
      <div className="flex items-center gap-2 rounded-lg px-2 py-1 hover:bg-surface-800/60 cursor-pointer transition-colors">
        <Avatar name={userName} size="sm" status="online" />
        <ChevronDown size={12} className="text-surface-600" />
      </div>
    </header>
  );
}
