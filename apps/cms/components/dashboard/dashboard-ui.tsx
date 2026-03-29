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
  TrendingUp,
  TrendingDown,
  Inbox,
  Menu,
  type LucideIcon,
} from "lucide-react";

import { 
  type ClassStatus, 
  type MemberPlan, 
  type IClassToday, 
  type IRecentRegistration 
} from "@/types/dashboard";

import { Avatar, AvatarFallback, AvatarImage } from "@workspace/ui/components/avatar";
import { Badge } from "@workspace/ui/components/badge";
import { Card } from "@workspace/ui/components/card";
import { Text } from "@workspace/ui/components/text";
import { cn } from "@workspace/ui/lib/utils";
import { 
  Sheet, 
  SheetContent, 
  SheetTrigger,
  SheetTitle,
  SheetHeader 
} from "@workspace/ui/components/sheet";
import SignOutButton from "../SignOutButton";

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
    <aside className="hidden lg:flex w-64 bg-background border-r border-border-dark flex-col justify-between py-6 shrink-0 h-screen sticky top-0">
      <SidebarContent user={user} />
    </aside>
  );
}

/**
 * Mobile-specific top navigation with a hamburger menu.
 * Only visible on screens smaller than 1024px.
 */
export function MobileNav({ user }: Readonly<{ user: SidebarUser }>) {
  return (
    <header className="lg:hidden sticky top-0 z-40 w-full border-b border-border-dark bg-background/80 backdrop-blur-md px-4 py-3 flex items-center justify-between">
      <div className="flex items-center gap-2">
        <div className="w-8 h-8 bg-primary rounded-lg flex items-center justify-center shrink-0">
          <Dumbbell className="text-background w-4 h-4" />
        </div>
        <Text as="p" size="sm" weight="bold" className="leading-none">
          Gym CMS
        </Text>
      </div>

      <Sheet>
        <SheetTrigger asChild>
          <button className="p-2 text-slate-400 hover:text-slate-100 transition-colors">
            <Menu className="w-6 h-6" />
          </button>
        </SheetTrigger>
        <SheetContent side="right" className="p-0 w-72 bg-background border-r-border-dark">
          <SheetHeader className="sr-only">
             <SheetTitle>Navegación del Panel</SheetTitle>
          </SheetHeader>
          <div className="flex flex-col h-full py-6">
            <SidebarContent user={user} />
          </div>
        </SheetContent>
      </Sheet>
    </header>
  );
}

/**
 * Shared sidebar content used by both Desktop Sidebar and Mobile Drawer.
 */
function SidebarContent({ user }: Readonly<{ user: SidebarUser }>) {
  return (
    <>
      <div className="px-6 flex flex-col gap-8">
        {/* Logo (Hidden on mobile as it's in the top nav, but kept for full view consistency) */}
        <div className="hidden lg:flex items-center gap-3">
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
      <div className="px-4 mt-auto">
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
          <SignOutButton />
        </div>
      </div>
    </>
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
   EMPTY STATE HELPER
   ───────────────────────────────────────────── */

interface NoDataProps {
  message: string;
  className?: string;
  icon?: LucideIcon;
}

export function NoData({ message, className, icon: Icon = Inbox }: Readonly<NoDataProps>) {
  return (
    <div className={cn("flex flex-col items-center justify-center p-12 text-center gap-3", className)}>
      <div className="w-12 h-12 rounded-full bg-white/5 flex items-center justify-center mb-1">
        <Icon className="w-6 h-6 text-slate-500" />
      </div>
      <Text variant="muted" size="sm" className="max-w-[200px]">
        {message}
      </Text>
    </div>
  );
}

/* ─────────────────────────────────────────────
   CLASS STATUS BADGE
   ───────────────────────────────────────────── */

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

const PLAN_CONFIG: Record<MemberPlan, { label: string; className: string }> = {
  vip:   { label: "VIP",   className: "bg-primary text-background-dark" },
  pro:   { label: "Pro",   className: "bg-primary/50 text-background-dark" },
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
   DASHBOARD DATA CONTAINERS (W/ EMPTY STATES)
   ───────────────────────────────────────────── */

import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@workspace/ui/components/table";

export function TodayClassesTable({ classes }: Readonly<{ classes: IClassToday[] }>) {
  if (classes.length === 0) {
    return <NoData message="No hay clases programadas para hoy." className="py-20" />;
  }

  return (
    <div className="overflow-x-auto">
      <Table>
        <TableHeader className="bg-white/5 border-b-0">
          <TableRow className="border-border-dark hover:bg-transparent">
            {["Hora", "Clase", "Entrenador", "Estado"].map((h) => (
              <TableHead key={h} className="px-6 py-4 text-slate-400 font-semibold text-xs uppercase tracking-wider">
                {h}
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody className="divide-y divide-border-dark">
          {classes.map((cls) => (
            <TableRow key={cls.time} className="hover:bg-white/2 transition-colors border-border-dark">
              <TableCell className="px-6 py-4">
                <Text as="span" size="base" variant="muted">{cls.time}</Text>
              </TableCell>
              <TableCell className="px-6 py-4">
                <Text as="span" size="base" weight="medium">{cls.name}</Text>
              </TableCell>
              <TableCell className="px-6 py-4">
                <Text as="span" size="base" variant="muted">{cls.trainer}</Text>
              </TableCell>
              <TableCell className="px-6 py-4">
                <ClassStatusBadge status={cls.status} />
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

export function RecentRegistrationsList({ registrations }: Readonly<{ registrations: IRecentRegistration[] }>) {
  if (registrations.length === 0) {
    return <NoData message="No se han registrado nuevos miembros recientemente." className="py-12" />;
  }

  return (
    <div className="flex flex-col flex-1 p-2 gap-1">
      {registrations.map((member) => (
        <ActivityItem key={member.name} {...member} />
      ))}
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
