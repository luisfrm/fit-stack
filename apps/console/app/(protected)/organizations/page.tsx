import { Plus, Building2, Users } from "lucide-react";
import { Button, Text } from "@workspace/ui/components";
import { DashboardHeader } from "@workspace/ui/components/dashboard-header";
import { OrganizationModal } from "@/components/dashboard/organization-modal";
import { organizationsService } from "@/lib/services/organizations-service";
import { OrganizationsSearch } from "./organizations-search";
import { OrganizationsResults } from "./organizations-results";
import { OrganizationsPagination } from "./organizations-pagination";
import { updateTag } from "next/cache";

export const dynamic = "force-dynamic";

const PAGE_LIMIT = 10;

export default async function OrganizationsPage({
  searchParams,
}: {
  searchParams: Promise<{ query?: string; page?: string }>;
}) {
  const params = await searchParams;
  const query = params.query || "";
  const page = Math.max(1, Number(params.page) || 1);

  const result = await organizationsService.getAll(
    {
      query: query || undefined,
      page,
      limit: PAGE_LIMIT,
      includeMemberCount: true,
    },
    { next: { revalidate: 60, tags: ["console:orgs"] } },
  );

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

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="bg-white/5 border border-white/5 p-5 rounded-2xl flex items-center justify-between">
          <div>
            <Text size="xs" variant="muted" className="uppercase font-black tracking-widest leading-none mb-1">Total Clientes</Text>
            <Text size="lg" weight="bold" className="text-white">{result.total}</Text>
          </div>
          <div className="p-3 bg-primary/10 rounded-xl text-primary">
            <Building2 size={20} />
          </div>
        </div>
        <div className="bg-white/5 border border-white/5 p-5 rounded-2xl flex items-center justify-between opacity-50 grayscale select-none">
          <div>
            <Text size="xs" variant="muted" className="uppercase font-black tracking-widest leading-none mb-1">Activos Hoy</Text>
            <Text size="lg" weight="bold" className="text-success">---</Text>
          </div>
          <div className="p-3 bg-success/10 rounded-xl text-success">
            <Users size={20} />
          </div>
        </div>
      </div>

      <OrganizationsSearch initialValue={query} />

      <div className="h-px w-full bg-white/5" />

      <OrganizationsResults organizations={result.data} />

      <OrganizationsPagination page={page} totalPages={result.totalPages} />
    </div>
  );
}
