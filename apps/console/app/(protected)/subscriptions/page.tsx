import { Plus } from "lucide-react";
import { Button } from "@workspace/ui/components";
import { DashboardHeader } from "@workspace/ui/components/dashboard-header";
import { SubscriptionsKpiSection } from "@/components/platform/subscriptions-kpi-section";
import { PlatformSubscriptionModal } from "@/components/platform/platform-subscription-modal";
import { SubscriptionsSidePanel } from "@/components/platform/subscriptions-side-panel";
import { platformSubscriptionsService } from "@/lib/services/platform-subscriptions-service";
import { platformPlansService } from "@/lib/services/platform-plans-service";
import { api } from "@/lib/api/client";
import { PLATFORM_SETTINGS_KEYS } from "@/lib/config/platform-settings";
import { updateTag } from "next/cache";
import { SubscriptionsClient } from "@/components/platform/subscriptions-client";
import type { CurrencyFormat } from "@workspace/shared";
import type { PlatformSubscriptionStatus } from "@workspace/shared/types";

export const dynamic = "force-dynamic";

const PAGE_LIMIT = 15;

const FILTER_TO_STATUS: Record<string, string | undefined> = {
  active: "active",
  expiring: "expiring",
  past_due: "past_due",
  read_only: "read_only",
  suspended: "suspended",
  cancelled: "cancelled",
};

export default async function PlatformSubscriptionsPage({
  searchParams,
}: {
  searchParams: Promise<{
    status?: string;
    search?: string;
    page?: string;
    planId?: string;
  }>;
}) {
  const params = await searchParams;
  const page = Math.max(1, Number(params.page) || 1);
  const search = params.search || "";
  const statusFilter = params.status || null;
  const planId = params.planId ? Number(params.planId) : undefined;

  const [
    subsResult,
    stats,
    settings,
    plans,
    revenue,
    activeSample,
    expiringSample,
  ] = await Promise.all([
    platformSubscriptionsService.getAll(
      {
        page,
        limit: PAGE_LIMIT,
        search: search || undefined,
        isTrial: statusFilter === "trial" ? true : undefined,
        status:
          statusFilter && statusFilter !== "trial"
            ? (FILTER_TO_STATUS[statusFilter] as
                | PlatformSubscriptionStatus
                | undefined)
            : undefined,
        planId,
      },
      { next: { revalidate: 60, tags: ["console:subs"] } },
    ),
    platformSubscriptionsService.getStats({
      next: { revalidate: 60, tags: ["console:subs"] },
    }),
    api<Record<string, string>>("/platform/settings", {
      next: { revalidate: 600, tags: ["console:settings"] },
    }),
    platformPlansService.getAll({
      next: { revalidate: 300, tags: ["console:plans"] },
    }),
    platformSubscriptionsService.getRevenue(12, {
      next: { revalidate: 3600, tags: ["console:subs"] },
    }),
    platformSubscriptionsService.getAll(
      { status: "active", limit: 200 },
      { next: { revalidate: 60, tags: ["console:subs"] } },
    ),
    platformSubscriptionsService.getAll(
      { status: "expiring", limit: 200 },
      { next: { revalidate: 60, tags: ["console:subs"] } },
    ),
  ]);

  const currencyFormat = settings[
    PLATFORM_SETTINGS_KEYS.CURRENCY_FORMAT
  ] as CurrencyFormat;
  const currency = settings[PLATFORM_SETTINGS_KEYS.PRIMARY_CURRENCY] || "USD";

  const refreshSubs = async () => {
    "use server";
    updateTag("console:subs");
  };

  return (
    <div className="flex flex-col gap-6">
      <DashboardHeader
        title="Suscripciones SaaS"
        description="Gestiona las suscripciones de todas las organizaciones al plataforma Fit-Stack."
        iconName="CalendarCheck"
      >
        <PlatformSubscriptionModal
          onSuccess={refreshSubs}
          settings={settings}
          trigger={
            <Button size="sm" rightIcon={<Plus size={18} />}>
              NUEVA SUSCRIPCIÓN
            </Button>
          }
        />
      </DashboardHeader>

      <SubscriptionsKpiSection
        stats={stats}
        activeFilter={statusFilter}
        currencyFormat={currencyFormat}
        currency={currency}
        onFilterChange={async (newFilter) => {
          "use server";
          const { redirect } = await import("next/navigation");
          const params = new URLSearchParams();
          if (newFilter) params.set("status", newFilter);
          params.set("page", "1");
          redirect(`/subscriptions?${params.toString()}`);
        }}
      />

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        <div className="lg:col-span-3">
          <SubscriptionsClient
            initialSubscriptions={subsResult.data}
            initialTotal={subsResult.total}
            initialTotalPages={subsResult.totalPages}
            page={page}
            limit={PAGE_LIMIT}
            currencyFormat={currencyFormat}
            initialQuery={search}
            initialStatus={statusFilter}
            initialPlanId={planId ?? null}
            plans={plans}
            settings={settings}
            onRefresh={refreshSubs}
          />
        </div>
        <SubscriptionsSidePanel
          revenue={revenue}
          activeSubscriptions={activeSample.data}
          expiringSubscriptions={expiringSample.data}
          currencyFormat={currencyFormat}
          currency={currency}
          settings={settings}
        />
      </div>
    </div>
  );
}
