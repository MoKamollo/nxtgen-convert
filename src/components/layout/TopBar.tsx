"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Avatar } from "@/components/ui/Avatar";
import { Badge } from "@/components/ui/Badge";
import { useSession } from "@/hooks/useSession";
import { apiFetch, apiUrl } from "@/lib/org";
import { cn, timeAgo } from "@/lib/utils";
import {
  Bell,
  BriefcaseBusiness,
  ChevronDown,
  Command,
  Contact,
  FileText,
  Inbox,
  Mail,
  PanelLeftClose,
  PanelLeftOpen,
  Plus,
  Search,
  X,
} from "lucide-react";

interface TopBarProps {
  collapsed: boolean;
  onToggleCollapse: () => void;
}

interface NotificationItem {
  id: string;
  title: string;
  body: string | null;
  type: string | null;
  link: string | null;
  read: boolean | null;
  createdAt: string;
}

const SEARCH_ROUTES = [
  { label: "Dashboard", path: "/dashboard", keywords: "overview home" },
  { label: "Contacts", path: "/crm/contacts", keywords: "people leads crm" },
  { label: "Companies", path: "/crm/companies", keywords: "accounts crm" },
  { label: "Deals", path: "/crm/deals", keywords: "pipeline revenue opportunities" },
  { label: "Tasks", path: "/crm/tasks", keywords: "work follow up" },
  { label: "Campaigns", path: "/email/campaigns", keywords: "email marketing" },
  { label: "Broadcasts", path: "/email/broadcasts", keywords: "send email" },
  { label: "Workflows", path: "/automation/workflows", keywords: "automation" },
  { label: "Orders", path: "/commerce/orders", keywords: "commerce sales" },
  { label: "Reports", path: "/analytics/reports", keywords: "export analytics" },
  { label: "Inbox", path: "/inbox", keywords: "notifications messages" },
  { label: "Settings", path: "/settings", keywords: "account integrations billing" },
];

const CREATE_LINKS = [
  { label: "Contact", path: "/crm/contacts?create=true", icon: Contact },
  { label: "Deal", path: "/crm/deals?create=true", icon: BriefcaseBusiness },
  { label: "Broadcast", path: "/email/broadcasts?create=true", icon: Mail },
  { label: "Article", path: "/support/kb?create=true", icon: FileText },
];

export function TopBar({ collapsed, onToggleCollapse }: TopBarProps) {
  const router = useRouter();
  const { session } = useSession();
  const [searchOpen, setSearchOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [notifOpen, setNotifOpen] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const userName = session?.user?.name ?? session?.org?.name ?? "Account";

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setSearchOpen(true);
      }
      if (event.key === "Escape") {
        setSearchOpen(false);
        setNotifOpen(false);
        setCreateOpen(false);
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  useEffect(() => {
    let cancelled = false;
    async function loadNotifications() {
      try {
        const response = await apiFetch(apiUrl("/api/inbox", { type: "notification" }), { cache: "no-store" });
        if (!response.ok) return;
        const payload = await response.json();
        if (!cancelled) {
          setNotifications((payload.notifications ?? []).slice(0, 6));
          setUnreadCount(Number(payload.unreadCount ?? 0));
        }
      } catch {
        // The header remains usable when notifications are temporarily unavailable.
      }
    }
    void Promise.resolve().then(loadNotifications);
    return () => { cancelled = true; };
  }, []);

  const searchResults = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return SEARCH_ROUTES;
    return SEARCH_ROUTES.filter((item) => `${item.label} ${item.keywords}`.toLowerCase().includes(query));
  }, [search]);

  async function openNotification(notification: NotificationItem) {
    setNotifOpen(false);
    if (!notification.read) {
      setNotifications((current) => current.map((item) => item.id === notification.id ? { ...item, read: true } : item));
      setUnreadCount((current) => Math.max(0, current - 1));
      await apiFetch(apiUrl("/api/inbox/read"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: "notification", id: notification.id }),
      }).catch(() => undefined);
    }
    const target = notification.link?.startsWith("/") ? notification.link : `/inbox?notification=${notification.id}`;
    router.push(target);
  }

  function navigate(path: string) {
    setSearchOpen(false);
    setCreateOpen(false);
    setSearch("");
    router.push(path);
  }

  return (
    <header className="h-14 shrink-0 flex items-center gap-3 border-b border-surface-800 bg-surface-950/80 backdrop-blur-sm px-4 z-20">
      <button
        onClick={onToggleCollapse}
        className="text-surface-500 hover:text-surface-300 transition-colors"
        title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
      >
        {collapsed ? <PanelLeftOpen size={18} /> : <PanelLeftClose size={18} />}
      </button>

      <div className="flex-1" />

      <button
        onClick={() => setSearchOpen(true)}
        className={cn(
          "flex items-center gap-2 rounded-lg border border-surface-800 bg-surface-900/50 px-3 h-8",
          "text-xs text-surface-500 hover:text-surface-300 hover:border-surface-700 transition-all",
          "w-48 lg:w-64",
        )}
      >
        <Search size={13} />
        <span className="flex-1 text-left">Search modules</span>
        <kbd className="hidden sm:flex items-center gap-0.5 text-[10px] text-surface-600 bg-surface-800 rounded px-1 py-0.5">
          <Command size={10} /> K
        </kbd>
      </button>

      <div className="relative">
        <button
          onClick={() => { setCreateOpen((value) => !value); setNotifOpen(false); }}
          className="flex items-center gap-1.5 rounded-lg gradient-brand h-8 px-3 text-xs font-semibold text-white hover:opacity-90 transition-opacity shadow-sm shadow-brand-500/30"
        >
          <Plus size={14} />
          <span className="hidden sm:inline">Create</span>
          <ChevronDown size={11} />
        </button>
        {createOpen && (
          <>
            <button aria-label="Close create menu" className="fixed inset-0 z-40 cursor-default" onClick={() => setCreateOpen(false)} />
            <div className="absolute right-0 top-10 z-50 w-48 rounded-xl border border-surface-700 bg-surface-900 p-1.5 shadow-2xl shadow-black/40">
              {CREATE_LINKS.map(({ label, path, icon: Icon }) => (
                <button key={path} onClick={() => navigate(path)} className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-xs text-surface-300 hover:bg-surface-800 hover:text-surface-100">
                  <Icon size={14} className="text-brand-400" />
                  {label}
                </button>
              ))}
            </div>
          </>
        )}
      </div>

      <div className="relative">
        <button
          onClick={() => { setNotifOpen((value) => !value); setCreateOpen(false); }}
          className="relative flex h-8 w-8 items-center justify-center rounded-lg text-surface-400 hover:text-surface-200 hover:bg-surface-800/60 transition-all"
          aria-label="Notifications"
        >
          <Bell size={16} />
          {unreadCount > 0 && (
            <span className="absolute -top-0.5 -right-0.5 flex min-w-4 h-4 px-1 items-center justify-center rounded-full bg-red-500 text-[9px] font-bold text-white">
              {unreadCount > 99 ? "99+" : unreadCount}
            </span>
          )}
        </button>

        {notifOpen && (
          <>
            <button aria-label="Close notifications" className="fixed inset-0 z-40 cursor-default" onClick={() => setNotifOpen(false)} />
            <div className="absolute right-0 top-10 z-50 w-80 rounded-xl border border-surface-700 bg-surface-900 shadow-2xl shadow-black/40 animate-slide-in">
              <div className="flex items-center justify-between px-4 py-3 border-b border-surface-800">
                <span className="text-sm font-semibold text-surface-100">Notifications</span>
                {unreadCount > 0 && <Badge variant="danger" size="sm">{unreadCount} unread</Badge>}
              </div>
              <div className="max-h-80 overflow-y-auto divide-y divide-surface-800">
                {notifications.length === 0 ? (
                  <div className="flex flex-col items-center px-5 py-10 text-center">
                    <Inbox size={22} className="text-surface-700" />
                    <p className="mt-2 text-xs text-surface-400">No notifications</p>
                  </div>
                ) : notifications.map((notification) => (
                  <button
                    key={notification.id}
                    onClick={() => void openNotification(notification)}
                    className={cn("w-full px-4 py-3 text-left hover:bg-surface-800/40 transition-colors", !notification.read && "bg-brand-500/5")}
                  >
                    <div className="flex items-start gap-2.5">
                      <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-brand-500/15 text-brand-400"><Bell size={13} /></div>
                      <div className="flex-1 min-w-0">
                        <p className={cn("text-xs truncate", !notification.read ? "font-semibold text-surface-100" : "text-surface-300")}>{notification.title}</p>
                        <p className="text-xs text-surface-500 truncate mt-0.5">{notification.body || "Account notification"}</p>
                      </div>
                      <span className="text-[10px] text-surface-600 shrink-0 mt-0.5">{timeAgo(notification.createdAt)}</span>
                    </div>
                  </button>
                ))}
              </div>
              <div className="p-3 border-t border-surface-800">
                <Link onClick={() => setNotifOpen(false)} href="/inbox?type=notification" className="block w-full text-center text-xs text-brand-400 hover:text-brand-300 transition-colors">
                  View all notifications
                </Link>
              </div>
            </div>
          </>
        )}
      </div>

      <Link href="/settings" className="flex items-center gap-2 rounded-lg px-2 py-1 hover:bg-surface-800/60 transition-colors">
        <Avatar name={userName} size="sm" status="online" />
        <ChevronDown size={12} className="text-surface-600" />
      </Link>

      {searchOpen && (
        <div className="fixed inset-0 z-[100] flex items-start justify-center bg-black/65 px-4 pt-[12vh] backdrop-blur-sm" onMouseDown={() => setSearchOpen(false)}>
          <div className="w-full max-w-xl overflow-hidden rounded-2xl border border-surface-700 bg-surface-900 shadow-2xl" onMouseDown={(event) => event.stopPropagation()}>
            <div className="flex items-center gap-3 border-b border-surface-800 px-4">
              <Search size={17} className="text-surface-500" />
              <input
                autoFocus
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Find a module"
                className="h-14 flex-1 bg-transparent text-sm text-surface-100 placeholder:text-surface-600 focus:outline-none"
              />
              <button onClick={() => setSearchOpen(false)} className="text-surface-500 hover:text-surface-200" aria-label="Close search"><X size={17} /></button>
            </div>
            <div className="max-h-96 overflow-y-auto p-2">
              {searchResults.length === 0 ? (
                <p className="px-3 py-8 text-center text-sm text-surface-500">No matching module</p>
              ) : searchResults.map((item) => (
                <button key={item.path} onClick={() => navigate(item.path)} className="flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left hover:bg-surface-800">
                  <Search size={14} className="text-brand-400" />
                  <span className="text-sm text-surface-200">{item.label}</span>
                  <span className="ml-auto text-xs text-surface-600">{item.path}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </header>
  );
}
