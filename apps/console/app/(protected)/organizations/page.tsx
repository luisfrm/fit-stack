import { Plus } from "lucide-react";
import { Button } from "@workspace/ui/components";
import { DashboardHeader } from "@workspace/ui/components/dashboard-header";
import { OrganizationModal } from "@/components/dashboard/organization-modal";
import {
  organizationsService,
  type OrgAiQuota,
} from "@/lib/services/organizations-service";
import { OrganizationsSearch } from "@/components/organizations/organizations-search";
import { OrganizationsFilters } from "@/components/organizations/organizations-filters";
import { OrganizationsKpiSection } from "@/components/organizations/organizations-kpi-section";
import { OrganizationsResults } from "@/components/organizations/organizations-results";
import { OrganizationsPagination } from "@/components/organizations/organizations-pagination";
import {
  selectOrgKpis,
  filterOrgsByCountry,
  filterOrgsBySubStatus,
  type OrgSubStatusFilter,
} from "@/lib/platform/organization-selectors";
import { updateTag } from "next/cache";

export const dynamic = "force-dynamic";

const PAGE_LIMIT = 10;
/**
 * Tope del dataset en memoria para KPIs/filtros exactos. Si `total` lo supera,
 * los KPIs son aproximados (ver nota en FUTURE_IDEAS §5: agregados server-side).
 */
const DATASET_LIMIT = 500;

const SUB_STATUS_VALUES: OrgSubStatusFilter[] = [
  "active",
  "past_due",
  "read_only",
  "suspended",
  "cancelled",
  "none",
];

export default async function OrganizationsPage({
  searchParams,
}: {
  searchParams: Promise<{
    query?: string;
    country?: string;
    subStatus?: string;
    page?: string;
  }>;
}) {
  const params = await searchParams;
  const query = params.query || "";
  const country = params.country || null;
  const subStatus = SUB_STATUS_VALUES.includes(
    params.subStatus as OrgSubStatusFilter,
  )
    ? (params.subStatus as OrgSubStatusFilter)
    : null;
  const page = Math.max(1, Number(params.page) || 1);

  const dataset = await organizationsService.getAll(
    {
      query: query || undefined,
      page: 1,
      limit: DATASET_LIMIT,
      includeMemberCount: true,
    },
    { next: { revalidate: 60, tags: ["console:orgs"] } },
  );

  const filtered = filterOrgsBySubStatus(
    filterOrgsByCountry(dataset.data, country),
    subStatus,
  );
  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_LIMIT));
  const safePage = Math.min(page, totalPages);
  const visible = filtered.slice(
    (safePage - 1) * PAGE_LIMIT,
    safePage * PAGE_LIMIT,
  );

  const aiEntries = await Promise.allSettled(
    visible.map(async (org) => {
      const quota = await organizationsService.getAiUsage(org.id, {
        next: { revalidate: 300, tags: ["console:orgs"] },
      });
      return [org.id, quota] as const;
    }),
  );
  const aiUsage: Record<string, OrgAiQuota> = {};
  for (const entry of aiEntries) {
    if (entry.status === "fulfilled") {
      aiUsage[entry.value[0]] = entry.value[1];
    }
  }

  const kpis = selectOrgKpis(dataset.data, new Date());

  const refreshOrgs = async () => {
    "use server";
    updateTag("console:orgs");
  };

  return (
    <div className="flex flex-col gap-8">
      <DashboardHeader
        title="Organizaciones"
        description="Listado global de clientes SaaS y su estado actual de suscripción."
        iconName="LayoutGrid"
      >
        <OrganizationModal
          onSuccess={refreshOrgs}
          trigger={
            <Button variant="primary" size="sm" leftIcon={<Plus size={18} />}>
              NUEVA ORGANIZACIÓN
            </Button>
          }
        />
      </DashboardHeader>

      <OrganizationsKpiSection kpis={kpis} />

      <div className="flex flex-col md:flex-row md:items-center gap-3">
        <OrganizationsSearch initialValue={query} />
        <OrganizationsFilters
          initialCountry={country}
          initialSubStatus={subStatus}
        />
      </div>

      <div className="h-px w-full bg-white/5" />

      <OrganizationsResults
        organizations={visible}
        aiUsage={aiUsage}
        totalFiltered={filtered.length}
        onRefreshServer={refreshOrgs}
      />

      <OrganizationsPagination page={safePage} totalPages={totalPages} />
    </div>
  );
}
