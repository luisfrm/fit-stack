/**
 * Dashboard-specific UI primitives built on top of @workspace/ui base components.
 * Scoped to the CMS admin dashboard — keeps page.tsx thin and readable.
 */
import * as React from "react";
import Link from "next/link";
import {
  LayoutDashboard,
  Users,
  CalendarDays,
  Dumbbell,
  CreditCard,
  Settings,
  LogOut,
  TrendingUp,
  TrendingDown,
  type LucideIcon,
} from "lucide-react";

import { Avatar, AvatarFallback, AvatarImage } from "@workspace/ui/components/avatar";
import { Badge } from "@workspace/ui/components/badge";
import { Card } from "@workspace/ui/components/card";
import { Text } from "@workspace/ui/components/text";
import { cn } from "@workspace/ui/lib/utils";

/* ─────────────────────────────────────────────
   SIDEBAR
   ───────────────────────────────────────────── */

interface NavItem {
  label: string;
  href: string;
  icon: LucideIcon;
  active?: boolean;
}

const NAV_ITEMS: NavItem[] = [
  { label: "Dashboard",     href: "/dashboard",   icon: LayoutDashboard, active: true },
  { label: "Miembros",      href: "/members",     icon: Users },
  { label: "Clases",        href: "/classes",     icon: CalendarDays },
  { label: "Entrenadores",  href: "/trainers",    icon: Dumbbell },
  { label: "Pagos",         href: "/payments",    icon: CreditCard },
  { label: "Configuración", href: "/settings",    icon: Settings },
];

interface SidebarUser {
  name: string;
  role: string;
  avatarUrl?: string;
}

export function AppSidebar({ user }: Readonly<{ user: SidebarUser }>) {
  return (
    <aside className="w-64 bg-background-dark border-r border-border-dark flex flex-col justify-between py-6 shrink-0 h-screen sticky top-0">
      <div className="px-6 flex flex-col gap-8">
        {/* Logo */}
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-primary rounded-lg flex items-center justify-center shrink-0">
            <Dumbbell className="text-background-dark w-5 h-5" />
          </div>
          <div>
            <Text as="p" size="md" weight="bold" variant="default" className="leading-none">
              Gym CMS
            </Text>
            <Text as="span" size="xs" variant="subtle">
              Admin Panel
            </Text>
          </div>
        </div>

        {/* Navigation */}
        <nav className="flex flex-col gap-1">
          {NAV_ITEMS.map((item) => (
            <SidebarNavItem key={item.href} {...item} />
          ))}
        </nav>
      </div>

      {/* Profile */}
      <div className="px-4">
        <div className="flex items-center gap-3 p-3 rounded-xl bg-white/5">
          <Avatar size="default">
            {user.avatarUrl && <AvatarImage src={user.avatarUrl} alt={user.name} />}
            <AvatarFallback>{user.name.charAt(0)}</AvatarFallback>
          </Avatar>
          <div className="flex flex-col min-w-0 flex-1">
            <Text as="span" size="base" weight="semibold" truncate>
              {user.name}
            </Text>
            <Text as="span" size="xs" variant="subtle" truncate>
              {user.role}
            </Text>
          </div>
          <button
            aria-label="Cerrar sesión"
            className="ml-auto text-slate-500 hover:text-slate-300 transition-colors"
          >
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </div>
    </aside>
  );
}

function SidebarNavItem({ label, href, icon: Icon, active }: Readonly<NavItem>) {
  return (
    <Link
      href={href}
      className={cn(
        "flex items-center gap-3 px-3 py-2.5 rounded-lg transition-colors text-sm font-medium",
        active
          ? "bg-primary/10 text-primary"
          : "text-slate-400 hover:bg-white/5 hover:text-slate-100"
      )}
    >
      <Icon className="w-5 h-5 shrink-0" />
      {label}
    </Link>
  );
}

/* ─────────────────────────────────────────────
   KPI CARD
   ───────────────────────────────────────────── */

type TrendDirection = "up" | "down" | "neutral";

interface KpiCardProps {
  label: string;
  value: string;
  icon: LucideIcon;
  trend?: { value: string; direction: TrendDirection };
  /** Adds a coloured left accent border and primary-coloured value text */
  accent?: boolean;
}

export function KpiCard({ label, value, icon: Icon, trend, accent }: Readonly<KpiCardProps>) {
  return (
    <Card
      className={cn(
        "bg-white/5 border-white/5 backdrop-blur-md rounded-xl p-6! gap-2! flex flex-col",
        accent && "border-l-4 border-l-primary"
      )}
    >
      <div className="flex justify-between items-start">
        <Text as="span" size="base" variant="muted" weight="medium">
          {label}
        </Text>
        <Icon className="w-5 h-5 text-primary shrink-0" />
      </div>
      <div className="flex items-end justify-between">
        <Text
          as="p"
          className="text-3xl"
          weight="bold"
          variant={accent ? "primary" : "default"}
        >
          {value}
        </Text>
        {trend && <KpiTrend direction={trend.direction} value={trend.value} />}
      </div>
    </Card>
  );
}

function KpiTrend({ direction, value }: Readonly<{ direction: TrendDirection; value: string }>) {
  if (direction === "up") {
    return (
      <span className="text-emerald-400 text-xs font-semibold flex items-center mb-1 gap-0.5">
        <TrendingUp className="w-3.5 h-3.5" />
        {value}
      </span>
    );
  }
  if (direction === "down") {
    return (
      <span className="text-rose-400 text-xs font-semibold flex items-center mb-1 gap-0.5">
        <TrendingDown className="w-3.5 h-3.5" />
        {value}
      </span>
    );
  }
  return (
    <Text as="span" size="xs" variant="subtle" weight="semibold" className="mb-1">
      {value}
    </Text>
  );
}

/* ─────────────────────────────────────────────
   OCCUPANCY BAR
   ───────────────────────────────────────────── */

export function OccupancyBar({ percentage }: Readonly<{ percentage: number }>) {
  return (
    <div className="flex items-center gap-3">
      <div className="flex-1 h-1.5 w-24 bg-white/10 rounded-full overflow-hidden">
        <div className="h-full bg-primary rounded-full" style={{ width: `${percentage}%` }} />
      </div>
      <Text as="span" size="sm" variant="muted">
        {percentage}%
      </Text>
    </div>
  );
}

/* ─────────────────────────────────────────────
   CLASS STATUS BADGE
   ───────────────────────────────────────────── */

export type ClassStatus = "live" | "scheduled" | "cancelled";

const STATUS_CONFIG: Record<ClassStatus, { label: string; className: string }> = {
  live:      { label: "En Vivo",    className: "bg-primary/20 text-primary hover:bg-primary/30" },
  scheduled: { label: "Programada", className: "bg-white/10 text-slate-300 hover:bg-white/20" },
  cancelled: { label: "Cancelada",  className: "bg-rose-500/20 text-rose-400 hover:bg-rose-500/30" },
};

interface ClassStatusBadgeProps extends Omit<React.ComponentProps<"span">, "children"> {
  status: ClassStatus;
}

export function ClassStatusBadge({ status, className, ...props }: Readonly<ClassStatusBadgeProps>) {
  const config = STATUS_CONFIG[status];
  return (
    <Badge
      className={cn(
        "text-[10px] uppercase rounded-full border-none font-bold tracking-wide",
        config.className,
        className
      )}
      {...props}
    >
      {config.label}
    </Badge>
  );
}

/* ─────────────────────────────────────────────
   MEMBER ACTIVITY ITEM (Últimos Registros)
   ───────────────────────────────────────────── */

export type MemberPlan = "vip" | "pro" | "basic";

const PLAN_CONFIG: Record<MemberPlan, { label: string; className: string }> = {
  vip:   { label: "VIP",   className: "bg-primary text-background-dark" },
  pro:   { label: "Pro",   className: "bg-slate-200 text-background-dark" },
  basic: { label: "Basic", className: "bg-slate-500 text-slate-100" },
};

interface ActivityItemProps {
  name: string;
  time: string;
  plan: MemberPlan;
  avatarUrl?: string;
}

export function ActivityItem({ name, time, plan, avatarUrl }: Readonly<ActivityItemProps>) {
  const planConfig = PLAN_CONFIG[plan];
  return (
    <div className="flex items-center gap-3 p-3 rounded-lg hover:bg-white/5 transition-colors">
      <Avatar size="default">
        {avatarUrl && <AvatarImage src={avatarUrl} alt={name} />}
        <AvatarFallback>{name.charAt(0)}</AvatarFallback>
      </Avatar>
      <div className="flex-1 min-w-0">
        <Text as="p" size="base" weight="medium" truncate>
          {name}
        </Text>
        <Text as="span" size="xs" variant="subtle" uppercase>
          {time}
        </Text>
      </div>
      <span className={cn("px-2 py-0.5 text-[10px] font-bold rounded uppercase shrink-0", planConfig.className)}>
        {planConfig.label}
      </span>
    </div>
  );
}

/* ─────────────────────────────────────────────
   ALERT ITEM
   ───────────────────────────────────────────── */

export type AlertSeverity = "warning" | "danger" | "success";

const ALERT_CONFIG: Record<AlertSeverity, { borderClass: string; iconBg: string; iconClass: string; buttonClass: string }> = {
  warning: { borderClass: "border-l-primary",      iconBg: "bg-primary/20",      iconClass: "text-primary",    buttonClass: "text-primary" },
  danger:  { borderClass: "border-l-rose-500",     iconBg: "bg-rose-500/20",     iconClass: "text-rose-500",   buttonClass: "text-rose-400" },
  success: { borderClass: "border-l-emerald-500",  iconBg: "bg-emerald-500/20",  iconClass: "text-emerald-500",buttonClass: "text-emerald-400" },
};

interface AlertItemProps {
  severity: AlertSeverity;
  icon: LucideIcon;
  title: string;
  description: string;
  actionLabel: string;
}

export function AlertItem({ severity, icon: Icon, title, description, actionLabel }: Readonly<AlertItemProps>) {
  const config = ALERT_CONFIG[severity];
  return (
    <Card
      className={cn(
        "flex-1 min-w-[300px] bg-white/5 border-white/5 backdrop-blur-md p-4! rounded-xl",
        "flex flex-row items-center gap-4 border-l-4",
        config.borderClass
      )}
    >
      <div className={cn("w-10 h-10 rounded-full flex items-center justify-center shrink-0", config.iconBg)}>
        <Icon className={cn("w-5 h-5", config.iconClass)} />
      </div>
      <div className="flex-1 min-w-0">
        <Text as="p" size="base" weight="semibold">{title}</Text>
        <Text as="p" size="xs" variant="subtle">{description}</Text>
      </div>
      <button className={cn("ml-auto text-xs font-bold uppercase hover:underline shrink-0", config.buttonClass)}>
        {actionLabel}
      </button>
    </Card>
  );
}
