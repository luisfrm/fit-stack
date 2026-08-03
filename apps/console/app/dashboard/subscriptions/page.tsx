import { Plus } from "lucide-react";
import { Button } from "@workspace/ui/components";
import { DashboardHeader } from "@workspace/ui/components/dashboard-header";
import { SubscriptionsKpiSection } from "@/components/platform/subscriptions-kpi-section";
import { PlatformSubscriptionModal } from "@/components/platform/platform-subscription-modal";
import { platformSubscriptionsService } from "@/lib/services/platform-subscriptions-service";
import { api } from "@/lib/api/client";
import { PLATFORM_SETTINGS_KEYS } from "@/lib/config/platform-settings";
import { updateTag } from "next/cache";
import { SubscriptionsClient } from "./subscriptions-client";
import type { CurrencyFormat } from "@/lib/utils/value-converters";
import type { PlatformSubscriptionStatus } from "@workspace/shared/types";

export const dynamic = "force-dynamic";

const PAGE_LIMIT = 15;

const FILTER_TO_STATUS: Record<string, PlatformSubscriptionStatus> = {
  active: "active",
  trial: "active",
  expiring: "active",
  suspended: "suspended",
};

export default async function PlatformSubscriptionsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; search?: string; page?: string }>;
}) {
  const params = await searchParams;
  const page = Math.max(1, Number(params.page) || 1);
  const search = params.search || "";
  const statusFilter = params.status || null;

  const [subsResult, stats, settings] = await Promise.all([
    platformSubscriptionsService.getAll(
      {
        page,
        limit: PAGE_LIMIT,
        search: search || undefined,
        isTrial: statusFilter === "trial" ? true : undefined,
        status:
          statusFilter && statusFilter !== "trial" && statusFilter !== "expiring"
            ? FILTER_TO_STATUS[statusFilter] ?? undefined
            : undefined,
      },
      { next: { revalidate: 60, tags: ["console:subs"] } },
    ),
    platformSubscriptionsService.getStats({
      next: { revalidate: 60, tags: ["console:subs"] },
    }),
    api<Record<string, string>>("/platform/settings", {
      next: { revalidate: 600, tags: ["console:settings"] },
    }),
  ]);

  const currencyFormat =
    (settings[PLATFORM_SETTINGS_KEYS.CURRENCY_FORMAT] as CurrencyFormat) ||
    "latam";

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
        onFilterChange={async (newFilter) => {
          "use server";
          const { redirect } = await import("next/navigation");
          const params = new URLSearchParams();
          if (newFilter) params.set("status", newFilter);
          params.set("page", "1");
          redirect(`/dashboard/subscriptions?${params.toString()}`);
        }}
      />

      <SubscriptionsClient
        initialSubscriptions={subsResult.data}
        initialTotal={subsResult.total}
        initialTotalPages={subsResult.totalPages}
        page={page}
        limit={PAGE_LIMIT}
        currencyFormat={currencyFormat}
        initialQuery={search}
        initialStatus={statusFilter}
      />
    </div>
  );
}
