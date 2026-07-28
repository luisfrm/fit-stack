"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
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
  ArrowLeftRight,
  User,
  CalendarClock,
  type LucideIcon,
} from "lucide-react";

import { IOrganization } from "@workspace/shared";

import {
  type IClassToday,
  type IRecentRegistration
} from "@/types/dashboard";
import { formatTimeRange } from "@/lib/config/display";
import { uploadService } from "@/lib/services/upload-service";
import { useAuth } from "@/lib/hooks/use-auth";
import { usePermissions } from "@workspace/auth/hooks";
import {
  PERMISSION_ACTIONS,
  PERMISSION_MODULES,
  type PermissionModule,
} from "@workspace/shared";
import { useTheme } from "@/lib/hooks/use-theme";
import { useSettings, SETTINGS_KEYS } from "@/lib/hooks/use-settings";
import { ValueConverter, type CurrencyFormat } from "@/lib/utils/value-converters";
import {
  AppSidebar as UISidebar,
  MobileNav as UIMobileNav,
  type SidebarUser,
  type SidebarNavItem,
  Text,
  Card,
  Table,
  Button,
  type ColumnDef,
  Modal,
} from "@workspace/ui/components";
import { NextImage } from "@workspace/ui/components/next/image";
import { cn } from "@workspace/ui/lib/utils";
import SignOutButton from "../SignOutButton";
import { authClient } from "@/lib/auth-client";
import { OrganizationPicker } from "./organization-picker";

/* ─────────────────────────────────────────────
   SIDEBAR NAV SCHEMAS
   ───────────────────────────────────────────── */

type GymNavItem = SidebarNavItem & { module: PermissionModule };

const GYM_NAV_ITEMS: GymNavItem[] = [
  { label: "Dashboard", href: "/dashboard", icon: LayoutDashboard, module: PERMISSION_MODULES.DASHBOARD },
  { label: "Staff", href: "/dashboard/staff", icon: ShieldCheck, module: PERMISSION_MODULES.STAFF },
  { label: "Pagos", href: "/dashboard/payments", icon: CreditCard, module: PERMISSION_MODULES.SUBSCRIPTIONS },
  { label: "Clientes", href: "/dashboard/members", icon: Users, module: PERMISSION_MODULES.MEMBERS },
  { label: "Contenido", href: "/dashboard/content", icon: LayoutDashboard, module: PERMISSION_MODULES.CONTENT },
  { label: "Membresías", href: "/dashboard/memberships", icon: Wallet, module: PERMISSION_MODULES.PLANS },
  { label: "Clases", href: "/dashboard/classes", icon: CalendarDays, module: PERMISSION_MODULES.CLASSES },
  { label: "Entrenadores", href: "/dashboard/trainers", icon: Dumbbell, module: PERMISSION_MODULES.STAFF },
  { label: "Configuración", href: "/dashboard/settings", icon: Settings, module: PERMISSION_MODULES.SETTINGS },
];

function useFilteredNavItems(): SidebarNavItem[] {
  const { can } = usePermissions();
  return GYM_NAV_ITEMS.filter((item) =>
    can(item.module, PERMISSION_ACTIONS.READ),
  );
}

export function SwitchOrganizationAction() {
  const router = useRouter();
  const [organizations, setOrganizations] = React.useState<IOrganization[]>([]);
  const [open, setOpen] = React.useState(false);
  const loadedRef = React.useRef(false);

  React.useEffect(() => {
    if (loadedRef.current) return;
    let cancelled = false;
    async function load() {
      const { data } = await authClient.organization.list();
      if (cancelled) return;
      if (data) setOrganizations(data as IOrganization[]);
      loadedRef.current = true;
    }
    load();
    return () => { cancelled = true; };
  }, []);

  const handleSelect = React.useCallback(() => {
    setOpen(false);
    router.refresh();
  }, [router]);

  // Solo mostrar si pertenece a más de una organización
  if (organizations.length <= 1) return null;

  return (
    <Modal
      open={open}
      onOpenChange={setOpen}
      title="Cambiar de sede"
      description="Selecciona la sede con la que deseas trabajar ahora."
      trigger={
        <Button
          variant="link"
          size="xs"
          className="p-0 uppercase gap-1.5 text-primary hover:text-primary/80"
          leftIcon={<ArrowLeftRight className="w-3 h-3" />}
        >
          Cambiar sede
        </Button>
      }
    >
      <div className="py-4">
        <OrganizationPicker
          isModal
          onSelect={handleSelect}
        />
      </div>
    </Modal>
  );
}

export function AppSidebar({ user }: Readonly<{ user: SidebarUser, activeOrganizationId?: string }>) {
  const { isPending: sessionLoading, activeOrganization } = useAuth();
  const { isLoading: settingsLoading } = useSettings();
  const { isDark, toggleTheme } = useTheme();

  const isBrandingLoading = sessionLoading || settingsLoading;
  const navigation = useFilteredNavItems();

  const brandingAction = React.useMemo(() => {
    return <SwitchOrganizationAction />;
  }, []);

  return (
    <UISidebar
      user={user}
      navigation={navigation}
      branding={{
        logo: activeOrganization?.logo ? uploadService.getMediaUrl(activeOrganization.logo) : undefined,
        title: activeOrganization?.name || "Gym unnamed",
        subtitle: activeOrganization?.slogan || "",
        isLoading: isBrandingLoading,
        fallbackIcon: Dumbbell,
        action: brandingAction,
      }}
      footer={<SignOutButton />}
      themeToggle={{ isDark, toggle: toggleTheme }}
    />
  );
}

export function MobileNav({ user }: Readonly<{ user: SidebarUser, activeOrganizationId?: string }>) {
  const { isPending: sessionLoading, activeOrganization } = useAuth();
  const { isLoading: settingsLoading } = useSettings();
  const { isDark, toggleTheme } = useTheme();

  const isBrandingLoading = sessionLoading || settingsLoading;
  const navigation = useFilteredNavItems();

  const brandingAction = React.useMemo(() => {
    return <SwitchOrganizationAction />;
  }, []);

  return (
    <UIMobileNav
      user={user}
      navigation={navigation}
      branding={{
        logo: activeOrganization?.logo ? uploadService.getMediaUrl(activeOrganization.logo) : undefined,
        title: activeOrganization?.name || "Elite Fitness",
        subtitle: activeOrganization?.slogan || "",
        isLoading: isBrandingLoading,
        fallbackIcon: Dumbbell,
        action: brandingAction,
      }}
      footer={<SignOutButton />}
      themeToggle={{ isDark, toggle: toggleTheme }}
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
  time?: string;
  imageUrl?: string | null;
  planName?: string;
  amountPaid?: number;
  currencyPaid?: string;
  endDate?: string;
}

export function ActivityItem({ name, time, imageUrl, planName, amountPaid, currencyPaid, endDate }: Readonly<ActivityItemProps>) {
  const { settings } = useSettings();
  const currencyFormat = (settings[SETTINGS_KEYS.CURRENCY_FORMAT] as CurrencyFormat) || "latam";

  return (
    <div className="flex items-center gap-3 p-3 rounded-lg hover:bg-foreground/5 transition-colors">
      {imageUrl ? (
        <NextImage
          src={uploadService.getMediaUrl(imageUrl)}
          alt={name}
          width={48}
          height={48}
          containerClassName="h-12 w-12 shrink-0 rounded-full"
          className="rounded-full"
        />
      ) : (
        <div className="w-12 h-12 rounded-full bg-primary text-primary-foreground flex items-center justify-center">
          <User className="w-4 h-4" />
        </div>
      )}
      <div className="flex-1 min-w-0">
        <Text as="p" size="base" weight="medium" truncate>
          {name}
        </Text>
        {planName && (
          <Text as="p" size="xs" variant="primary" weight="semibold" className="truncate">
            {planName}
          </Text>
        )}
        <div className="flex items-center gap-2">
          {amountPaid !== undefined && (
            <Text as="span" size="xs" variant="muted" className="tabular-nums">
              {ValueConverter.format(amountPaid / 100, currencyPaid || 'USD', currencyFormat)}
            </Text>
          )}
          {endDate && (
            <Text as="span" size="xs" variant="subtle" className="flex items-center gap-0.5">
              <CalendarClock size={10} />
              {new Date(endDate).toLocaleDateString('es-ES', { day: '2-digit', month: 'short' })}
            </Text>
          )}
          <Text as="span" size="xs" variant="subtle" className="ml-auto uppercase">
            {time}
          </Text>
        </div>
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
    return <NoData message="No hay pagos registrados recientemente." className="py-12" />;
  }

  return (
    <div className="flex flex-col flex-1 p-2 gap-1 animate-in fade-in duration-500">
      {registrations.map((member) => (
        <ActivityItem key={member.id} {...member} />
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
  danger: { icon: AlertCircle, borderClass: "border-l-destructive", iconBg: "bg-destructive/20", iconClass: "text-destructive", buttonClass: "text-destructive" },
  success: { icon: BadgeCheck, borderClass: "border-l-success", iconBg: "bg-success/20", iconClass: "text-success", buttonClass: "text-success" },
  info: { icon: AlertCircle, borderClass: "border-l-info", iconBg: "bg-info/20", iconClass: "text-info", buttonClass: "text-info" },
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
