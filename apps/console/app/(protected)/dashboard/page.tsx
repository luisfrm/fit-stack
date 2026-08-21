import { Building2, Users, TrendingUp, ShieldCheck, Plus } from "lucide-react";
import { Button, Text, StatCard } from "@workspace/ui/components";
import { DashboardHeader } from "@workspace/ui/components/dashboard-header";
import { OrganizationModal } from "@/components/dashboard/organization-modal";
import { OrganizationsList } from "@/components/dashboard/organizations-list";
import { organizationsService } from "@/lib/services/organizations-service";
import { platformSubscriptionsService } from "@/lib/services/platform-subscriptions-service";
import { api } from "@/lib/api/client";
import { PLATFORM_SETTINGS_KEYS } from "@/lib/config/platform-settings";
import { ValueConverter, type CurrencyFormat } from "@/lib/utils/value-converters";
import { updateTag } from "next/cache";
import Link from "next/link";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const [{ data: orgs }, stats, settings] = await Promise.all([
    organizationsService.getAll(
      { limit: 50, includeMemberCount: true },
      { next: { revalidate: 60, tags: ["console:orgs"] } },
    ),
    platformSubscriptionsService
      .getStats({
        next: { revalidate: 60, tags: ["console:subs"] },
      })
      .catch(() => ({
        active: 0,
        trial: 0,
        pastDue: 0,
        readOnly: 0,
        suspended: 0,
        cancelled: 0,
        total: 0,
        monthlyRevenueCents: 0,
        previousMonthRevenueCents: 0,
        mrrCents: 0,
      })),
    api<Record<string, string>>("/platform/settings", {
      next: { revalidate: 600, tags: ["console:settings"] },
    }).catch(() => ({} as Record<string, string>)),
  ]);

  const totalMembers = orgs.reduce(
    (acc, org) => acc + (org.memberCount ?? 0),
    0,
  );

  // Extract primary platform currency and format settings
  const settingsMap = (settings || {}) as Record<string, string>;
  const primaryCurrency = settingsMap[PLATFORM_SETTINGS_KEYS.PRIMARY_CURRENCY] || "USD";
  const currencyFormat = (settingsMap[PLATFORM_SETTINGS_KEYS.CURRENCY_FORMAT] as CurrencyFormat) || "latam";

  // Calculate dynamic B2B revenue and monthly growth comparison
  const monthlyRevenue = (stats.monthlyRevenueCents ?? 0) / 100;
  const formattedRevenue = ValueConverter.format(monthlyRevenue, primaryCurrency, currencyFormat);

  const prevRevenueCents = stats.previousMonthRevenueCents ?? 0;
  const currRevenueCents = stats.monthlyRevenueCents ?? 0;
  let revenueChangeLabel = "0% vs mes anterior";

  if (prevRevenueCents > 0) {
    const growth = ((currRevenueCents - prevRevenueCents) / prevRevenueCents) * 100;
    const sign = growth >= 0 ? "+" : "";
    revenueChangeLabel = `${sign}${growth.toFixed(1)}% vs mes anterior`;
  } else if (currRevenueCents > 0) {
    revenueChangeLabel = "+100% vs mes anterior";
  }

  const refreshOrgs = async () => {
    "use server";
    updateTag("console:orgs");
  };

  return (
    <>
      <DashboardHeader
        title="SaaS Platform Admin"
        description="Gestión global de organizaciones y métricas de la plataforma."
        iconName="Globe"
      >
        <OrganizationModal
          trigger={
            <Button variant="primary" size="sm" leftIcon={<Plus size={18} />}>
              Nueva Organización
            </Button>
          }
          onSuccess={refreshOrgs}
        />
      </DashboardHeader>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-10">
        <StatCard
          title="Total Gimnasios"
          value={orgs.length.toString()}
          change="+2 este mes"
          icon={<Building2 className="text-primary" size={24} />}
        />
        <StatCard
          title="Miembros Globales"
          value={totalMembers.toLocaleString()}
          change="+15% vs mes anterior"
          icon={<Users className="text-blue-400" size={24} />}
        />
        <StatCard
          title="Ingresos B2B"
          value={formattedRevenue}
          change={revenueChangeLabel}
          icon={<TrendingUp className="text-emerald-400" size={24} />}
        />
        <StatCard
          title="Estado Sistema"
          value="Optimo"
          status="online"
          icon={<ShieldCheck className="text-amber-400" size={24} />}
        />
      </div>

      <div className="space-y-6 mb-10">
        <div className="flex justify-between items-end">
          <div className="space-y-1">
            <Text as="p" size="lg" weight="bold">Gimnasios Activos</Text>
            <Text size="sm" variant="muted">Monitoreo y gestión de inquilinos de la plataforma.</Text>
          </div>
          <Button asChild variant="ghost" size="sm" className="text-primary font-bold hover:bg-primary/5">
            <Link href="/organizations">
              Ver todas las organizaciones
            </Link>
          </Button>
        </div>

        <OrganizationsList organizations={orgs} onSuccess={refreshOrgs} />
      </div>
    </>
  );
}
