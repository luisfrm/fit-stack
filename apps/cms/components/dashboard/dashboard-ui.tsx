"use client";

import * as React from "react";
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
  Wallet,
  CalendarCheck,
  AlertTriangle,
  AlertCircle,
  BadgeCheck,
  ShieldCheck,
  Building2,
  PackageCheck,
  BarChart3,
  Globe,
  type LucideIcon,
} from "lucide-react";

import { GLOBAL_ROLES, IOrganization } from "@workspace/shared";

import {
  type IClassToday,
  type IRecentRegistration
} from "@/types/dashboard";
import { formatTimeRange } from "@/lib/config/display";
import { uploadService } from "@/lib/services/upload-service";
import { useAuth } from "@/lib/hooks/use-auth";
import { useSettings } from "@/lib/hooks/use-settings";
import {
  AppSidebar as UISidebar,
  MobileNav as UIMobileNav,
  type SidebarUser,
  type SidebarNavItem,
  Text,
  Avatar,
  AvatarFallback,
  AvatarImage,
  Card,
  Table,
  Button,
  type ColumnDef,
} from "@workspace/ui/components";
import { cn } from "@workspace/ui/lib/utils";
import SignOutButton from "../SignOutButton";
import { authClient } from "@/lib/auth-client";
import { useRouter } from "next/navigation";
import { ArrowLeft } from "lucide-react";

/* ─────────────────────────────────────────────
   SIDEBAR NAV SCHEMAS
   ───────────────────────────────────────────── */

const GYM_NAV_ITEMS: SidebarNavItem[] = [
  { label: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
  { label: "Staff", href: "/dashboard/staff", icon: ShieldCheck },
  { label: "Pagos", href: "/dashboard/payments", icon: CreditCard },
  { label: "Clientes", href: "/dashboard/members", icon: Users },
  { label: "Contenido", href: "/dashboard/content", icon: LayoutDashboard },
  { label: "Membresías", href: "/dashboard/memberships", icon: Wallet },
  { label: "Clases", href: "/dashboard/classes", icon: CalendarDays },
  { label: "Entrenadores", href: "/dashboard/trainers", icon: Dumbbell },
  { label: "Configuración", href: "/dashboard/settings", icon: Settings },
];

const SAAS_NAV_ITEMS: SidebarNavItem[] = [
  { label: "Dashboard Global", href: "/dashboard", icon: BarChart3 },
  { label: "Organizaciones", href: "/dashboard/platform/organizations", icon: Building2 },
  { label: "Planes", href: "/dashboard/platform/plans", icon: PackageCheck },
  { label: "Finanzas", href: "/dashboard/platform/revenue", icon: TrendingUp },
  { label: "Ajustes Globales", href: "/dashboard/platform/settings", icon: Globe },
];

function ReturnToSaaSButton() {
  const router = useRouter();
  const [loading, setLoading] = React.useState(false);

  const handleReturn = async () => {
    try {
      setLoading(true);
      await authClient.organization.setActive({ organizationId: null });
      router.push("/dashboard");
      router.refresh();
    } catch (error) {
      console.error("Error returning to SaaS:", error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Button
      variant="link"
      size="xs"
      onClick={handleReturn}
      loading={loading}
      className="p-0 uppercase gap-1.5"
      leftIcon={<ArrowLeft className="w-3 h-3" />}
    >
      Volver a SaaS
    </Button>
  );
}


export function AppSidebar({ user, activeOrganizationId }: Readonly<{ user: SidebarUser, activeOrganizationId?: string }>) {
  const { isPending: sessionLoading, activeOrganization } = useAuth();
  const { isLoading: settingsLoading } = useSettings();

  const isBrandingLoading = sessionLoading || settingsLoading;

  // Si es ADMIN pero TIENE una organización activa, usamos el menú de GYM
  const isSaaSMode = user.role === GLOBAL_ROLES.ADMIN && !activeOrganizationId;
  const navigation = isSaaSMode ? SAAS_NAV_ITEMS : GYM_NAV_ITEMS;

  return (
    <UISidebar
      user={user}
      navigation={navigation}
      branding={{
        logo: !isSaaSMode && activeOrganization?.logo ? uploadService.getMediaUrl(activeOrganization.logo) : undefined,
        title: isSaaSMode ? "FitStack" : (activeOrganization?.name || "Gym unnamed"),
        subtitle: isSaaSMode ? "Administración Master" : ((activeOrganization as IOrganization)?.slogan || ""),
        isLoading: isBrandingLoading,
        fallbackIcon: isSaaSMode ? Globe : Dumbbell,
        action: !isSaaSMode && user.role === GLOBAL_ROLES.ADMIN ? <ReturnToSaaSButton /> : undefined,
      }}
      footer={<SignOutButton />}
    />
  );
}

export function MobileNav({ user, activeOrganizationId }: Readonly<{ user: SidebarUser, activeOrganizationId?: string }>) {
  const { isPending: sessionLoading, activeOrganization } = useAuth();
  const { isLoading: settingsLoading } = useSettings();

  const isBrandingLoading = sessionLoading || settingsLoading;

  const isSaaSMode = user.role === GLOBAL_ROLES.ADMIN && !activeOrganizationId;
  const navigation = isSaaSMode ? SAAS_NAV_ITEMS : GYM_NAV_ITEMS;

  return (
    <UIMobileNav
      user={user}
      navigation={navigation}
      branding={{
        logo: !isSaaSMode && activeOrganization?.logo ? uploadService.getMediaUrl(activeOrganization.logo) : undefined,
        title: isSaaSMode ? "FitStack" : (activeOrganization?.name || "Elite Fitness"),
        subtitle: isSaaSMode ? "Administración Master" : ((activeOrganization as IOrganization)?.slogan || ""),
        isLoading: isBrandingLoading,
        fallbackIcon: isSaaSMode ? Globe : Dumbbell,
        action: !isSaaSMode && user.role === GLOBAL_ROLES.ADMIN ? <ReturnToSaaSButton /> : undefined,
      }}
      footer={<SignOutButton />}
    />
  );
}




/* ─────────────────────────────────────────────
   KPI CARD
   ───────────────────────────────────────────── */

const ICON_MAP = {
  users: Users,
  wallet: Wallet,
  calendar: CalendarCheck,
  alert: AlertTriangle,
  trendingUp: TrendingUp,
  trendingDown: TrendingDown,
  inbox: Inbox,
} as const;

type IconName = keyof typeof ICON_MAP;
type TrendDirection = "up" | "down" | "neutral";

interface KpiCardProps {
  label: string;
  value: React.ReactNode;
  icon: IconName;
  trend?: { value: string; direction: TrendDirection };
  /** Adds a coloured left accent border and primary-coloured value text */
  accent?: boolean;
}

export function KpiCard({ label, value, icon, trend, accent }: Readonly<KpiCardProps>) {
  const Icon = ICON_MAP[icon] || Inbox;

  return (
    <Card
      className={cn(
        "p-6! gap-2! flex flex-col",
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
          as="div"
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
      <div className="flex-1 h-1.5 w-24 bg-foreground/10 rounded-full overflow-hidden">
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
    <div className={cn("flex flex-col items-center p-12 text-center gap-3", className)}>
      <div className="w-12 h-12 rounded-full bg-foreground/5 flex items-center justify-center mb-1">
        <Icon className="w-6 h-6 text-foreground-dim" />
      </div>
      <Text variant="muted" size="sm">
        {message}
      </Text>
    </div>
  );
}


interface ActivityItemProps {
  name: string;
  time: string;
  avatarUrl?: string;
}

export function ActivityItem({ name, time, avatarUrl }: Readonly<ActivityItemProps>) {
  return (
    <div className="flex items-center gap-3 p-3 rounded-lg hover:bg-foreground/5 transition-colors">
      <Avatar size="default">
        {avatarUrl && <AvatarImage src={uploadService.getMediaUrl(avatarUrl)} alt={name} />}
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
    </div>
  );
}


/* ─────────────────────────────────────────────
   DASHBOARD DATA CONTAINERS (W/ EMPTY STATES)
   ───────────────────────────────────────────── */


const TODAY_CLASSES_COLUMNS: ColumnDef<IClassToday>[] = [
  {
    header: "Hora",
    className: "pl-6",
    headerClassName: "pl-6",
    cell: (cls) => (
      <Text as="span" size="base" variant="muted">
        {formatTimeRange(cls.startTime, cls.endTime)}
      </Text>
    )
  },
  {
    header: "Clase",
    cell: (cls) => <Text as="span" size="base" weight="medium">{cls.name}</Text>
  },
  {
    header: "Entrenador",
    cell: (cls) => <Text as="span" size="base" variant="muted">{cls.trainerName ?? 'Sin asignar'}</Text>
  },
  {
    header: "Cupos",
    cell: (cls) => (
      <Text as="span" size="base" variant="muted">
        {cls.capacity ? `${cls.capacity} cupos` : '—'}
      </Text>
    )
  }
];

export function TodayClassesTable({ classes, loading }: Readonly<{ classes: IClassToday[]; loading?: boolean }>) {
  return (
    <Table
      columns={TODAY_CLASSES_COLUMNS}
      data={classes}
      loading={loading}
      emptyState={<NoData message="No hay clases programadas para hoy." className="py-20" />}
      className="rounded-none"
    />
  );
}

export function RecentRegistrationsList({ registrations, loading }: Readonly<{ registrations: IRecentRegistration[]; loading?: boolean }>) {
  const skeletonIds = React.useMemo(() => Array.from({ length: 5 }, (_, i) => `reg-sk-${i}-${Math.random().toString(36).slice(2, 7)}`), []);

  if (loading) {
    return (
      <div className="flex flex-col flex-1 p-2 gap-1">
        {skeletonIds.map((id) => (
          <div key={id} className="flex items-center gap-3 p-3 rounded-lg animate-pulse">
            <div className="w-10 h-10 rounded-full bg-foreground/10 shrink-0" />
            <div className="flex-1 space-y-2 py-1">
              <div className="h-4 bg-foreground/10 rounded w-2/3" />
              <div className="h-3 bg-foreground/5 rounded w-1/3" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (registrations.length === 0) {
    return <NoData message="No se han registrado nuevos miembros recientemente." className="py-12" />;
  }

  return (
    <div className="flex flex-col flex-1 p-2 gap-1 animate-in fade-in duration-500">
      {registrations.map((member) => (
        <ActivityItem key={member.name} {...member} />
      ))}
    </div>
  );
}

/* ─────────────────────────────────────────────
   ALERT ITEM
   ───────────────────────────────────────────── */

export type AlertSeverity = "warning" | "danger" | "success" | "info";

const ALERT_CONFIG: Record<AlertSeverity, { borderClass: string; iconBg: string; iconClass: string; buttonClass: string; icon: LucideIcon }> = {
  warning: { icon: AlertTriangle, borderClass: "border-l-primary", iconBg: "bg-primary/20", iconClass: "text-primary", buttonClass: "text-primary" },
  danger: { icon: AlertCircle, borderClass: "border-l-rose-500", iconBg: "bg-rose-500/20", iconClass: "text-rose-500", buttonClass: "text-rose-400" },
  success: { icon: BadgeCheck, borderClass: "border-l-emerald-500", iconBg: "bg-emerald-500/20", iconClass: "text-emerald-500", buttonClass: "text-emerald-400" },
  info: { icon: AlertCircle, borderClass: "border-l-sky-500", iconBg: "bg-sky-500/20", iconClass: "text-sky-400", buttonClass: "text-sky-400" },
};

interface AlertItemProps {
  severity: AlertSeverity;
  title: string;
  description: string;
  actionLabel: string;
}

export function AlertItem({ severity, title, description, actionLabel }: Readonly<AlertItemProps>) {
  const config = ALERT_CONFIG[severity];
  const Icon = config.icon;
  return (
    <Card
      className={cn(
        "flex-1 min-w-[300px] p-4! rounded-xl",
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
      <Button
        variant="link"
        size="xs"
        className={cn("ml-auto shrink-0", config.buttonClass)}
      >
        {actionLabel}
      </Button>
    </Card>
  );
}
