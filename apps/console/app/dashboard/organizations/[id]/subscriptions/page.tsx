import { DashboardHeader } from "@workspace/ui/components/dashboard-header";
import { SubscriptionsTable } from "@/components/platform/subscriptions-table";
import { SubscriptionsPagination } from "./subscriptions-pagination";
import { BackButton } from "./back-button";
import { platformSubscriptionsService } from "@/lib/services/platform-subscriptions-service";
import { organizationsService } from "@/lib/services/organizations-service";
import { api } from "@/lib/api/client";
import { PLATFORM_SETTINGS_KEYS } from "@/lib/config/platform-settings";
import type { CurrencyFormat } from "@/lib/utils/value-converters";

export const dynamic = "force-dynamic";

const PAGE_LIMIT = 15;

export default async function OrganizationSubscriptionsPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ page?: string }>;
}) {
  const [{ id }, sp, settings] = await Promise.all([
    params,
    searchParams,
    api<Record<string, string>>("/platform/settings", {
      next: { revalidate: 600, tags: ["console:settings"] },
    }),
  ]);

  const page = Math.max(1, Number(sp.page) || 1);

  const [org, subsResult] = await Promise.all([
    organizationsService.getById(id, {
      next: { revalidate: 60, tags: ["console:orgs"] },
    }).catch(() => null),
    platformSubscriptionsService.getAll(
      { organizationId: id, page, limit: PAGE_LIMIT },
      { next: { revalidate: 60, tags: ["console:subs"] } },
    ),
  ]);

  const currencyFormat =
    (settings[PLATFORM_SETTINGS_KEYS.CURRENCY_FORMAT] as CurrencyFormat) ||
    "latam";

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center gap-4">
        <BackButton />
      </div>

      <DashboardHeader
        title={org?.name || "Organización"}
        description={`Suscripciones activas de esta organización en Fit-Stack.`}
        iconName="Building2"
      />

      <SubscriptionsTable
        subscriptions={subsResult.data}
        currencyFormat={currencyFormat}
        pagination={{
          page,
          totalPages: subsResult.totalPages,
          total: subsResult.total,
          limit: PAGE_LIMIT,
          onPageChange: () => {},
        }}
      />

      <SubscriptionsPagination page={page} totalPages={subsResult.totalPages} />
    </div>
  );
}
