"use client";

import * as React from "react";
import {
  Building2,
  Users,
  TrendingUp,
  Plus,
  ShieldCheck,
} from "lucide-react";
import {
  Button,
  Text
} from "@workspace/ui/components";
import { DashboardHeader } from "./dashboard-header";
import { StatCard } from "./stat-card";
import { type Organization } from "./organization-mobile-card";
import { OrganizationModal } from "./organization-modal";
import { OrganizationsList } from "./organizations-list";
import { organizationsService } from "@/lib/services/organizations-service";

export function SaaSAdminDashboard() {
  const [organizations, setOrganizations] = React.useState<Organization[]>([]);
  const [isLoading, setIsLoading] = React.useState(true);

  const fetchOrganizations = React.useCallback(async () => {
    try {
      setIsLoading(true);
      const result = await organizationsService.getAll({ includeMemberCount: true });

      const formatted: Organization[] = result.data.map(org => {
        const subStatus = org.latestSubscription?.status;

        let dashboardStatus: Organization['status'] = 'pending';
        if (subStatus === 'active' || subStatus === 'past_due' || subStatus === 'read_only') {
          dashboardStatus = 'active';
        } else if (subStatus === 'suspended' || subStatus === 'canceled') {
          dashboardStatus = 'inactive';
        }

        return {
          id: org.id,
          name: org.name,
          slug: org.slug || 'no-slug',
          logo: org.logo || undefined,
          domain: `${org.slug || 'org'}.fitstack.com`,
          memberCount: org.memberCount || 0,
          status: dashboardStatus,
          countryCode: org.countryCode,
          taxId: org.taxId || undefined,
          legalName: org.legalName || undefined,
          address: org.address || undefined,
          metadata: org.metadata || {}
        };
      });
      setOrganizations(formatted);
    } catch (error: any) {
      console.error("Error fetching organizations:", error);
    } finally {
      setIsLoading(false);
    }
  }, []);

  React.useEffect(() => {
    fetchOrganizations();
  }, [fetchOrganizations]);

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
          onSuccess={fetchOrganizations}
        />
      </DashboardHeader>

      {/* ── Global Stats ── */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-10">
        <StatCard
          title="Total Gimnasios"
          value={organizations.length.toString()}
          change="+2 este mes"
          icon={<Building2 className="text-primary" size={24} />}
        />
        <StatCard
          title="Miembros Globales"
          value={organizations.reduce((acc, org) => acc + org.memberCount, 0).toLocaleString()}
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

      {/* ── Organizations Section ── */}
      <div className="space-y-6 mb-10">
        <div className="flex justify-between items-end">
          <div className="space-y-1">
            <Text as="p" size="lg" weight="bold">Gimnasios Activos</Text>
            <Text size="sm" variant="muted">Monitoreo y gestión de inquilinos de la plataforma.</Text>
          </div>
          <Button variant="ghost" size="sm" className="text-primary font-bold hover:bg-primary/5">
            Ver todas las organizaciones
          </Button>
        </div>

        <OrganizationsList
          organizations={organizations}
          isLoading={isLoading}
          onSuccess={fetchOrganizations}
        />
      </div>
    </>
  );
}
