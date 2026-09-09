import { Building2, Users, TrendingUp, ShieldCheck, Plus } from "lucide-react";
import { Button, StatCard } from "@workspace/ui/components";
import { DashboardHeader } from "@workspace/ui/components/dashboard-header";
import { OrganizationModal } from "@/components/dashboard/organization-modal";
import { RenewalsWidget } from "@/components/dashboard/dashboard-renewals-widget";
import { PaymentsReviewWidget } from "@/components/dashboard/dashboard-payments-review-widget";
import { TrialsWidget } from "@/components/dashboard/dashboard-trials-widget";
import { NewOrgsWidget } from "@/components/dashboard/dashboard-new-orgs-widget";
import { organizationsService } from "@/lib/services/organizations-service";
import { platformSubscriptionsService } from "@/lib/services/platform-subscriptions-service";
import {
  selectNewOrgsThisMonth,
  selectPaymentsReview,
  selectRenewals,
  selectTrials,
} from "@/lib/dashboard/selectors";
import { api } from "@/lib/api/client";
import { PLATFORM_SETTINGS_KEYS } from "@/lib/config/platform-settings";
import {
  ValueConverter,
  type CurrencyFormat,
} from "@/lib/utils/value-converters";
import { updateTag } from "next/cache";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const [{ data: orgs }, stats, settings, recentSubs] = await Promise.all([
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
    }).catch(() => ({}) as Record<string, string>),
    platformSubscriptionsService
      .getAll(
        { limit: 50 },
        { next: { revalidate: 60, tags: ["console:subs"] } },
      )
      .catch(() => ({ data: [], total: 0, page: 1, limit: 50, totalPages: 0 })),
  ]);

  const totalMembers = orgs.reduce(
    (acc, org) => acc + (org.memberCount ?? 0),
    0,
  );

  // Extract primary platform currency and format settings
  const settingsMap = (settings || {}) as Record<string, string>;
  const primaryCurrency = settingsMap[PLATFORM_SETTINGS_KEYS.PRIMARY_CURRENCY];
  const currencyFormat = settingsMap[
    PLATFORM_SETTINGS_KEYS.CURRENCY_FORMAT
  ] as CurrencyFormat;

  // Calculate dynamic B2B revenue and monthly growth comparison
  const monthlyRevenue = (stats.monthlyRevenueCents ?? 0) / 100;
  const formattedRevenue = ValueConverter.format(
    monthlyRevenue,
    primaryCurrency,
    currencyFormat,
  );

  const prevRevenueCents = stats.previousMonthRevenueCents ?? 0;
  const currRevenueCents = stats.monthlyRevenueCents ?? 0;
  let revenueChangeLabel = "0% vs mes anterior";

  if (prevRevenueCents > 0) {
    const growth =
      ((currRevenueCents - prevRevenueCents) / prevRevenueCents) * 100;
    const sign = growth >= 0 ? "+" : "";
    revenueChangeLabel = `${sign}${growth.toFixed(1)}% vs mes anterior`;
  } else if (currRevenueCents > 0) {
    revenueChangeLabel = "+100% vs mes anterior";
  }

  // Widget datasets (derivados sin endpoints nuevos)
  const newOrgs = selectNewOrgsThisMonth(orgs);
  const renewals = selectRenewals(orgs);
  const trials = selectTrials(orgs);
  const paymentsReview = selectPaymentsReview(recentSubs.data);

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
          change={`+${newOrgs.length} este mes`}
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

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-10">
        <RenewalsWidget items={renewals} />
        <PaymentsReviewWidget subs={paymentsReview} />
        <TrialsWidget trials={trials} />
        <NewOrgsWidget orgs={newOrgs} />
      </div>
    </>
  );
}
