import { DashboardHeader } from "@workspace/ui/components/dashboard-header";
import { SubscriptionsTable } from "@/components/platform/subscriptions-table";
import { SubscriptionsPagination } from "./subscriptions-pagination";
import { BackButton } from "./back-button";
import { platformSubscriptionsService } from "@/lib/services/platform-subscriptions-service";
import { organizationsService } from "@/lib/services/organizations-service";
import { platformPlansService } from "@/lib/services/platform-plans-service";
import { featuresService } from "@/lib/services/features-service";
import { api } from "@/lib/api/client";
import { PLATFORM_SETTINGS_KEYS } from "@/lib/config/platform-settings";
import { OrgFeaturesInspector } from "@/components/platform/org-features-inspector";
import { FREE_TIER_FEATURES, resolveFeatures } from "@workspace/shared";
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

  const [org, subsResult, catalogData] = await Promise.all([
    organizationsService.getById(id, {
      next: { revalidate: 60, tags: ["console:orgs"] },
    }).catch(() => null),
    platformSubscriptionsService.getAll(
      { organizationId: id, page, limit: PAGE_LIMIT },
      { next: { revalidate: 60, tags: ["console:subs"] } },
    ),
    featuresService.getCatalog({ next: { revalidate: 3600, tags: ["console:settings"] } }).catch(() => null),
  ]);

  const currencyFormat =
    (settings[PLATFORM_SETTINGS_KEYS.CURRENCY_FORMAT] as CurrencyFormat) ||
    "latam";

  const rawFreeTier = settings[PLATFORM_SETTINGS_KEYS.FEATURE_FLAGS_FREE_TIER];
  const freeTierFeatures = (() => {
    if (!rawFreeTier) return resolveFeatures(FREE_TIER_FEATURES);
    try {
      return resolveFeatures(JSON.parse(rawFreeTier));
    } catch {
      return resolveFeatures(FREE_TIER_FEATURES);
    }
  })();

  const activeSub = subsResult.data.find((s) => !s.cancelledAt && s.status !== "cancelled") ?? subsResult.data[0] ?? null;
  let activePlanFeatures: Record<string, unknown> | null = null;
  if (activeSub?.planId) {
    try {
      const plan = await platformPlansService.getById(activeSub.planId, { next: { revalidate: 60, tags: ["console:plans"] } });
      activePlanFeatures = (plan.features as Record<string, unknown> | null) ?? null;
    } catch (_e) {
      // ignore: plan fetch optional for inspector
    }
  }
  const isFreeTierFallback = !activeSub || activeSub.status === "suspended" || activeSub.status === "cancelled";

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

      <OrgFeaturesInspector
        subscriptionPlanFeatures={activePlanFeatures as never}
        freeTierFeatures={freeTierFeatures}
        catalog={catalogData?.catalog}
        organizationName={org?.name ?? id}
        isFreeTierFallback={isFreeTierFallback}
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
