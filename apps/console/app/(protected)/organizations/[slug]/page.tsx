import { notFound } from "next/navigation";
import { Plus, Pencil } from "lucide-react";
import { Button } from "@workspace/ui/components";
import { DashboardHeader } from "@workspace/ui/components/dashboard-header";
import { BackButton } from "@/components/organizations/detail/back-button";
import { OrgSubscriptions } from "@/components/organizations/detail/org-subscriptions";
import { OrgProfileCards } from "@/components/organizations/detail/org-profile-cards";
import { OrgProfileSidePanel } from "@/components/organizations/detail/org-profile-side-panel";
import { OrganizationModal } from "@/components/dashboard/organization-modal";
import { PlatformSubscriptionModal } from "@/components/platform/platform-subscription-modal";
import { platformSubscriptionsService } from "@/lib/services/platform-subscriptions-service";
import { organizationsService } from "@/lib/services/organizations-service";
import { platformPlansService } from "@/lib/services/platform-plans-service";
import { featuresService } from "@/lib/services/features-service";
import { api } from "@/lib/api/client";
import { PLATFORM_SETTINGS_KEYS } from "@/lib/config/platform-settings";
import type { IPlatformOrganization } from "@workspace/shared/types";
import type { CurrencyFormat } from "@workspace/shared";
import { updateTag } from "next/cache";

export const dynamic = "force-dynamic";

const PAGE_LIMIT = 5;

export default async function OrganizationProfilePage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ page?: string }>;
}) {
  const [{ slug }, sp, settings] = await Promise.all([
    params,
    searchParams,
    api<Record<string, string>>("/platform/settings", {
      next: { revalidate: 600, tags: ["console:settings"] },
    }),
  ]);

  const page = Math.max(1, Number(sp.page) || 1);

  const org = await organizationsService
    .getBySlug(
      slug,
      { includeMemberCount: true },
      { next: { revalidate: 60, tags: ["console:orgs"] } },
    )
    .catch(() => null);

  if (!org) notFound();

  const [subsResult, catalogData, invoices, gymOverview, aiQuota] =
    await Promise.all([
      platformSubscriptionsService.getSubscriptionsByOrg(
        org.id,
        { page, limit: PAGE_LIMIT },
        { next: { revalidate: 60, tags: ["console:subs"] } },
      ),
      featuresService
        .getCatalog({ next: { revalidate: 3600, tags: ["console:settings"] } })
        .catch(() => null),
      platformSubscriptionsService
        .getInvoicesByOrg(org.id, {
          next: { revalidate: 60, tags: ["console:subs"] },
        })
        .catch(() => []),
      organizationsService
        .getGymOverview(org.id, {
          next: { revalidate: 300, tags: ["console:orgs"] },
        })
        .catch(() => null),
      organizationsService
        .getAiUsage(org.id, {
          next: { revalidate: 300, tags: ["console:orgs"] },
        })
        .catch(() => null),
    ]);

  const currencyFormat =
    (settings[PLATFORM_SETTINGS_KEYS.CURRENCY_FORMAT] as CurrencyFormat) ||
    "latam";
  const currency = settings[PLATFORM_SETTINGS_KEYS.PRIMARY_CURRENCY] || "USD";

  const activeSub =
    subsResult.data.find((s) => !s.cancelledAt && s.status !== "cancelled") ??
    subsResult.data[0] ??
    null;
  let activePlanFeatures: Record<string, unknown> | null = null;
  if (activeSub?.planId) {
    try {
      const plan = await platformPlansService.getById(activeSub.planId, {
        next: { revalidate: 60, tags: ["console:plans"] },
      });
      activePlanFeatures =
        (plan.features as Record<string, unknown> | null) ?? null;
    } catch (_e) {
      // ignore: plan fetch optional for inspector
    }
  }
  const refreshOrgs = async () => {
    "use server";
    updateTag("console:orgs");
    updateTag("console:subs");
  };

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center gap-4">
        <BackButton />
      </div>

      <DashboardHeader
        title={org?.name || "Organización"}
        description={`Perfil, suscripciones y facturación de esta organización en Fit-Stack.`}
        iconName="Building2"
      >
        <div className="flex items-center gap-2">
          <OrganizationModal
            initialData={org as IPlatformOrganization}
            onSuccess={refreshOrgs}
            trigger={
              <Button
                variant="outlined"
                size="sm"
                leftIcon={<Pencil size={16} />}
              >
                EDITAR
              </Button>
            }
          />
          <PlatformSubscriptionModal
            initialOrganization={org as IPlatformOrganization}
            onSuccess={refreshOrgs}
            settings={settings}
            trigger={
              <Button size="sm" leftIcon={<Plus size={18} />}>
                GESTIONAR PLAN
              </Button>
            }
          />
        </div>
      </DashboardHeader>

      <OrgProfileCards
        activeSub={activeSub}
        planFeatures={activePlanFeatures as never}
        catalog={catalogData?.catalog}
        memberCount={org.memberCount}
        userCount={org.userCount}
        gymOverview={gymOverview}
        aiQuota={aiQuota}
        invoices={invoices}
        currencyFormat={currencyFormat}
        currency={currency}
      />

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        <div className="lg:col-span-3">
          <OrgSubscriptions
            subscriptions={subsResult.data}
            total={subsResult.total}
            totalPages={subsResult.totalPages}
            page={page}
            limit={PAGE_LIMIT}
            currencyFormat={currencyFormat}
            settings={settings}
            onRefresh={refreshOrgs}
          />
        </div>
        <OrgProfileSidePanel
          slug={org.slug ?? org.id}
          countryCode={org.countryCode}
          timezone={org.timezone}
          primaryCurrency={org.primaryCurrency}
          createdAt={org.createdAt}
        />
      </div>
    </div>
  );
}
