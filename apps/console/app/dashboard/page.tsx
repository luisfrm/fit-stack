import { Building2, Users, TrendingUp, ShieldCheck, Plus } from "lucide-react";
import { Button, Text, StatCard } from "@workspace/ui/components";
import { DashboardHeader } from "@workspace/ui/components/dashboard-header";
import { OrganizationModal } from "@/components/dashboard/organization-modal";
import { OrganizationsList } from "@/components/dashboard/organizations-list";
import { organizationsService } from "@/lib/services/organizations-service";
import { updateTag } from "next/cache";
import Link from "next/link";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const { data: orgs } = await organizationsService.getAll(
    { limit: 50, includeMemberCount: true },
    { next: { revalidate: 60, tags: ["console:orgs"] } },
  );

  const totalMembers = orgs.reduce(
    (acc, org) => acc + (org.memberCount ?? 0),
    0,
  );

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
          value="$2,850.00"
          change="+8.4%"
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
            <Link href="/dashboard/organizations">
              Ver todas las organizaciones
            </Link>
          </Button>
        </div>

        <OrganizationsList organizations={orgs} onSuccess={refreshOrgs} />
      </div>
    </>
  );
}
