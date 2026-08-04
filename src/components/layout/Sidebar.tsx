"use client";
import Image from "next/image";
import { apiFetch } from "@/lib/org";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { Avatar } from "@/components/ui/Avatar";
import { Badge } from "@/components/ui/Badge";
import {
  LayoutDashboard,
  Users,
  Building2,
  TrendingUp,
  Mail,
  Zap,
  BarChart3,
  Settings,
  HeadphonesIcon,
  ShoppingBag,
  Globe,
  MessageSquare,
  Calendar,
  FileText,
  Star,
  Bot,
  Megaphone,
  ChevronDown,
  ChevronRight,
  Layers,
  Activity,
  PieChart,
  Cpu,
  Share2,
  Hash,
  LogOut,
  HeartHandshake,
  Gift,
  SlidersHorizontal,
  ShieldCheck,
  Terminal,
} from "lucide-react";
import { useState, useEffect } from "react";
import { useSession } from "@/hooks/useSession";

interface NavItem {
  label: string;
  href: string;
  icon: React.ElementType;
  badge?: string | number;
  badgeVariant?: "default" | "success" | "warning" | "danger" | "info" | "purple";
  children?: NavItem[];
  minimumRole?: "admin";
}

const navigation: NavItem[] = [
  {
    label: "Dashboard",
    href: "/dashboard",
    icon: LayoutDashboard,
  },
  {
    label: "CRM",
    href: "/crm",
    icon: Users,
    children: [
      { label: "Contacts", href: "/crm/contacts", icon: Users, badgeVariant: "warning" },
      { label: "Companies", href: "/crm/companies", icon: Building2 },
      { label: "Deals", href: "/crm/deals", icon: TrendingUp, badgeVariant: "danger" },
      { label: "Activities", href: "/crm/activities", icon: Activity },
      { label: "Tasks", href: "/crm/tasks", icon: FileText },
      { label: "Calendar", href: "/crm/calendar", icon: Calendar },
    ],
  },
  {
    label: "Email",
    href: "/email",
    icon: Mail,
    children: [
      { label: "Campaigns", href: "/email/campaigns", icon: Megaphone },
      { label: "Templates", href: "/email/templates", icon: Layers },
      { label: "Broadcasts", href: "/email/broadcasts", icon: Share2 },
      { label: "Analytics", href: "/email/analytics", icon: BarChart3 },
    ],
  },
  {
    label: "Automation",
    href: "/automation",
    icon: Zap,
    badge: "AI",
    badgeVariant: "purple",
    children: [
      { label: "Workflows", href: "/automation/workflows", icon: Zap, badgeVariant: "success" },
      { label: "Triggers", href: "/automation/triggers", icon: Hash },
      { label: "Templates", href: "/automation/templates", icon: Layers },
    ],
  },
  {
    label: "Intelligence",
    href: "/ai",
    icon: Bot,
    badge: "New",
    badgeVariant: "success",
    children: [
      { label: "Operational Signals", href: "/ai/insights", icon: Star },
      { label: "AI Assistant", href: "/ai/assistant", icon: Bot },
      { label: "Lead Scoring", href: "/ai/scoring", icon: Star },
      { label: "Customer Signals", href: "/ai/predictions", icon: Cpu },
    ],
  },
  {
    label: "Marketing",
    href: "/marketing",
    icon: Megaphone,
    children: [
      { label: "Campaigns", href: "/marketing/campaigns", icon: Megaphone },
      { label: "Funnels", href: "/marketing/funnels", icon: TrendingUp },
      { label: "Social", href: "/marketing/social", icon: Share2 },
      { label: "Forms", href: "/marketing/forms", icon: FileText },
      { label: "Segments & Personalization", href: "/personalization", icon: SlidersHorizontal },
    ],
  },
  {
    label: "Commerce",
    href: "/commerce",
    icon: ShoppingBag,
    children: [
      { label: "Products", href: "/commerce/products", icon: ShoppingBag },
      { label: "Orders", href: "/commerce/orders", icon: FileText },
      { label: "Subscriptions", href: "/commerce/subscriptions", icon: Star },
      { label: "Affiliate", href: "/commerce/affiliate", icon: Share2 },
    ],
  },
  {
    label: "Website",
    href: "/website",
    icon: Globe,
    children: [
      { label: "Pages", href: "/website/pages", icon: FileText },
      { label: "Blog", href: "/website/blog", icon: FileText },
      { label: "SEO", href: "/website/seo", icon: Globe },
    ],
  },
  {
    label: "Inbox",
    href: "/inbox",
    icon: MessageSquare,
  },
  {
    label: "Customer Success",
    href: "/customer-success",
    icon: HeartHandshake,
  },
  {
    label: "Loyalty",
    href: "/loyalty",
    icon: Gift,
  },
  {
    label: "Support",
    href: "/support",
    icon: HeadphonesIcon,
    children: [
      { label: "Tickets", href: "/support/tickets", icon: FileText, badgeVariant: "warning" },
      { label: "Knowledge Base", href: "/support/kb", icon: Layers },
      { label: "NPS & CSAT", href: "/support/nps", icon: Star },
    ],
  },
  {
    label: "Analytics",
    href: "/analytics",
    icon: BarChart3,
    children: [
      { label: "Revenue", href: "/analytics/revenue", icon: TrendingUp },
      { label: "Pipeline", href: "/analytics/pipeline", icon: BarChart3 },
      { label: "Customers", href: "/analytics/customers", icon: Users },
      { label: "Campaigns", href: "/analytics/campaigns", icon: PieChart },
      { label: "Reports", href: "/analytics/reports", icon: FileText },
    ],
  },
  {
    label: "Operations",
    href: "/operations",
    icon: ShieldCheck,
    minimumRole: "admin",
  },
  {
    label: "Settings",
    href: "/settings",
    icon: Settings,
  },
];

interface SidebarProps {
  collapsed?: boolean;
}

export function Sidebar({ collapsed }: SidebarProps) {
  const pathname = usePathname();
  const [expanded, setExpanded] = useState<string[]>(["/crm", "/email", "/automation"]);
  const { session } = useSession();
  const userName  = session?.user?.name  ?? session?.org?.name ?? "…";
  const userTitle = session?.user?.jobTitle ?? session?.role ?? "";
  const [badgeOverrides, setBadgeOverrides] = useState<Record<string, number>>({});
  const canViewAdministrativeOperations = session?.role === "admin" || session?.role === "owner";
  const visibleNavigation = navigation.filter((item) => item.minimumRole !== "admin" || canViewAdministrativeOperations);

  useEffect(() => {
    fetch("/api/sidebar-counts")
      .then((r) => r.json())
      .then((json: Record<string, number | undefined>) => {
        const overrides: Record<string, number> = {};
        for (const [key, val] of Object.entries(json)) {
          if (val !== undefined && val > 0) overrides[key] = val;
        }
        setBadgeOverrides(overrides);
      })
      .catch(() => {});
  }, []);

  const [userMenuOpen, setUserMenuOpen] = useState(false);

  async function handleLogout() {
    await apiFetch("/api/auth/logout", { method: "POST" });
    window.location.href = "/login";
  }

  const toggleExpanded = (href: string) => {
    setExpanded((prev) =>
      prev.includes(href) ? prev.filter((h) => h !== href) : [...prev, href]
    );
  };

  const isActive = (href: string) => {
    if (href === "/dashboard") return pathname === "/dashboard" || pathname === "/";
    return pathname.startsWith(href);
  };

  return (
    <aside
      className={cn(
        "flex h-full flex-col border-r border-surface-800 bg-surface-950 sidebar-transition",
        collapsed ? "w-14" : "w-60"
      )}
    >
      {/* Logo */}
      <div className="flex h-14 shrink-0 items-center border-b border-surface-800 px-4">
        <a href="https://nxtgen-stack.com/convert/" className="flex items-center gap-2">
          {collapsed ? (
            <div style={{ width: 28, height: 28, borderRadius: 6, background: "linear-gradient(135deg,#6366f1,#3b9eff)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
              <span style={{ color: "#fff", fontWeight: 800, fontSize: 13, fontFamily: "sans-serif" }}>N</span>
            </div>
          ) : (
            <>
              <Image src="/nxtgen-logo.png" alt="NxtGen Convergence" width={140} height={28} className="h-7 w-auto shrink-0" priority />
              <span className="text-xs font-semibold tracking-widest text-brand-400 uppercase ml-1">
                Convergence
              </span>
            </>
          )}
        </a>
      </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto py-3 px-2 space-y-0.5">
        {visibleNavigation.map((item) => (
          <NavItemComponent
            key={item.href}
            item={item}
            collapsed={collapsed}
            isActive={isActive}
            expanded={expanded}
            onToggle={toggleExpanded}
            badgeOverrides={badgeOverrides}
          />
        ))}
      </nav>

      {/* User */}
      <div className="shrink-0 border-t border-surface-800 p-3 relative">
        {collapsed ? (
          <button onClick={handleLogout} title="Sign out"
            className="flex justify-center w-full rounded-lg p-1.5 hover:bg-surface-800/60 transition-colors">
            <Avatar name={userName} size="sm" status="online" />
          </button>
        ) : (
          <>
            <button
              onClick={() => setUserMenuOpen((v) => !v)}
              className="w-full flex items-center gap-2.5 rounded-lg px-2 py-1.5 hover:bg-surface-800/60 cursor-pointer transition-colors"
            >
              <Avatar name={userName} size="sm" status="online" />
              <div className="flex-1 min-w-0 text-left">
                <p className="text-xs font-semibold text-surface-200 truncate">{userName}</p>
                <p className="text-[10px] text-surface-500 truncate">{userTitle}</p>
              </div>
              <ChevronDown size={12} className={cn("text-surface-500 shrink-0 transition-transform", userMenuOpen && "rotate-180")} />
            </button>
            {userMenuOpen && (
              <div className="absolute bottom-full left-3 right-3 mb-1 rounded-lg border border-surface-700 bg-surface-900 shadow-xl overflow-hidden">
                <a
                  href="https://command.nxtgen-stack.com"
                  target="_blank"
                  rel="noreferrer"
                  className="w-full flex items-center gap-2.5 px-3 py-2.5 text-xs text-surface-400 hover:text-surface-200 hover:bg-surface-800/60 transition-colors"
                >
                  <Terminal size={13} />
                  Command Center
                </a>
                <div className="border-t border-surface-800" />
                <button
                  onClick={handleLogout}
                  className="w-full flex items-center gap-2.5 px-3 py-2.5 text-xs text-red-400 hover:bg-red-500/10 transition-colors"
                >
                  <LogOut size={13} />
                  Sign out
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </aside>
  );
}

function NavItemComponent({
  item,
  collapsed,
  isActive,
  expanded,
  onToggle,
  badgeOverrides = {},
}: {
  item: NavItem;
  collapsed?: boolean;
  isActive: (href: string) => boolean;
  expanded: string[];
  onToggle: (href: string) => void;
  badgeOverrides?: Record<string, number>;
}) {
  const active = isActive(item.href);
  const hasChildren = item.children && item.children.length > 0;
  const isExpanded = expanded.includes(item.href);
  const Icon = item.icon;
  const resolvedBadge = badgeOverrides[item.href] ?? item.badge;

  if (hasChildren && !collapsed) {
    return (
      <div>
        <button
          onClick={() => onToggle(item.href)}
          className={cn(
            "w-full flex items-center gap-2.5 px-2.5 py-1.5 rounded-lg text-left transition-all duration-150",
            active
              ? "text-surface-100 bg-surface-800/60"
              : "text-surface-500 hover:text-surface-300 hover:bg-surface-800/40"
          )}
        >
          <Icon size={15} className="shrink-0" />
          <span className="flex-1 text-xs font-medium">{item.label}</span>
          {resolvedBadge && (
            <Badge variant={item.badgeVariant || "default"} size="sm">
              {resolvedBadge}
            </Badge>
          )}
          {isExpanded ? (
            <ChevronDown size={12} className="shrink-0 text-surface-600" />
          ) : (
            <ChevronRight size={12} className="shrink-0 text-surface-600" />
          )}
        </button>
        {isExpanded && (
          <div className="ml-4 mt-0.5 space-y-0.5 border-l border-surface-800 pl-3">
            {item.children!.map((child) => {
              const ChildIcon = child.icon;
              const childActive = isActive(child.href);
              const childBadge = badgeOverrides[child.href] ?? child.badge;
              return (
                <Link
                  key={child.href}
                  href={child.href}
                  className={cn(
                    "flex items-center gap-2 px-2 py-1.5 rounded-lg text-xs transition-all duration-150",
                    childActive
                      ? "text-brand-400 bg-brand-500/10 font-medium"
                      : "text-surface-500 hover:text-surface-300 hover:bg-surface-800/40"
                  )}
                >
                  <ChildIcon size={13} className="shrink-0" />
                  <span className="flex-1">{child.label}</span>
                  {childBadge && (
                    <Badge variant={child.badgeVariant || "default"} size="sm">
                      {childBadge}
                    </Badge>
                  )}
                </Link>
              );
            })}
          </div>
        )}
      </div>
    );
  }

  const destination = hasChildren ? item.children![0].href : item.href;

  return (
    <Link
      href={destination}
      title={collapsed ? item.label : undefined}
      className={cn(
        "flex items-center gap-2.5 px-2.5 py-1.5 rounded-lg transition-all duration-150",
        collapsed ? "justify-center" : "",
        active
          ? "text-brand-400 bg-brand-500/10 font-medium"
          : "text-surface-500 hover:text-surface-300 hover:bg-surface-800/40"
      )}
    >
      <Icon size={15} className="shrink-0" />
      {!collapsed && (
        <>
          <span className="flex-1 text-xs font-medium">{item.label}</span>
          {resolvedBadge && (
            <Badge variant={item.badgeVariant || "default"} size="sm">
              {resolvedBadge}
            </Badge>
          )}
        </>
      )}
    </Link>
  );
}
