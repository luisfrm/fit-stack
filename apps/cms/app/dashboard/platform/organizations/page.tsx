"use client";

import * as React from "react";
import {
  Plus,
  Search,
  ChevronLeft,
  ChevronRight,
  Building2,
  Loader2,
  Users
} from "lucide-react";
import {
  Button,
  Input,
  Text,
  toast
} from "@workspace/ui/components";
import { type IPlatformOrganization } from "@workspace/shared/types";
import { organizationsService } from "@/lib/services/organizations-service";
import { OrganizationTable } from "@/components/platform/organization-table";
import { OrganizationCard } from "@/components/platform/organization-card";
import { OrganizationModal } from "@/components/platform/organization-modal";
import { AddSubscriptionModal } from "@/components/platform/add-subscription-modal";
import { DashboardHeader } from "@/components/dashboard/dashboard-header";

export default function OrganizationsPage() {
  const [organizations, setOrganizations] = React.useState<IPlatformOrganization[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [total, setTotal] = React.useState(0);

  // Filtros y Paginación
  const [query, setQuery] = React.useState("");
  const [tempQuery, setTempQuery] = React.useState("");
  const [page, setPage] = React.useState(1);
  const [totalPages, setTotalPages] = React.useState(1);
  const limit = 10;

  // Modales
  const [selectedOrg, setSelectedOrg] = React.useState<IPlatformOrganization | undefined>();
  const [isEditModalOpen, setIsEditModalOpen] = React.useState(false);
  const [isSubModalOpen, setIsSubModalOpen] = React.useState(false);

  const loadOrganizations = React.useCallback(async () => {
    try {
      setLoading(true);
      const result = await organizationsService.getAll({
        query: query || undefined,
        page,
        limit
      });
      setOrganizations(result.data);
      setTotal(result.total);
      setTotalPages(result.totalPages);
    } catch (error: any) {
      toast.error(error.message || "Error al cargar organizaciones");
    } finally {
      setLoading(false);
    }
  }, [query, page, limit]);

  React.useEffect(() => {
    loadOrganizations();
  }, [loadOrganizations]);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setQuery(tempQuery);
    setPage(1);
  };

  const handleEdit = (org: IPlatformOrganization) => {
    setSelectedOrg(org);
    setIsEditModalOpen(true);
  };

  const handleAddSubscription = (org: IPlatformOrganization) => {
    setSelectedOrg(org);
    setIsSubModalOpen(true);
  };

  const handleCreateNew = () => {
    setSelectedOrg(undefined);
    setIsEditModalOpen(true);
  };

  return (
    <div className="flex flex-col gap-8">
      <DashboardHeader
        title="Organizaciones"
        description="Listado global de clientes SaaS y su estado actual de suscripción."
        iconName="LayoutGrid"
      >
        <Button
          variant="primary"
          size="sm"
          onClick={handleCreateNew}
          leftIcon={<Plus size={18} />}
        >
          NUEVA ORGANIZACIÓN
        </Button>
      </DashboardHeader>

      {/* Stats bar */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-white/5 border border-white/5 p-5 rounded-2xl flex items-center justify-between">
          <div>
            <Text size="xs" variant="muted" className="uppercase font-black tracking-widest leading-none mb-1">Total Clientes</Text>
            <Text size="lg" weight="bold" className="text-white">{total}</Text>
          </div>
          <div className="p-3 bg-primary/10 rounded-xl text-primary">
            <Building2 size={20} />
          </div>
        </div>
        <div className="bg-white/5 border border-white/5 p-5 rounded-2xl flex items-center justify-between opacity-50 grayscale select-none">
          <div>
            <Text size="xs" variant="muted" className="uppercase font-black tracking-widest leading-none mb-1">Activos Hoy</Text>
            <Text size="lg" weight="bold" className="text-emerald-400">---</Text>
          </div>
          <div className="p-3 bg-emerald-500/10 rounded-xl text-emerald-500">
            <Users size={20} />
          </div>
        </div>
        <form onSubmit={handleSearch} className="flex gap-2 w-full">
          <Input
            value={tempQuery}
            onChange={(e) => setTempQuery(e.target.value)}
            placeholder="Buscar por nombre o slug..."
            leftIcon={<Search size={16} />}
            className="flex-1 bg-white/5 border-white/5 h-full min-h-[60px]"
          />
          <Button type="submit" variant="outlined" className="h-full min-h-[60px] px-6 uppercase font-black text-xs tracking-widest">
            BUSCAR
          </Button>
        </form>
      </div>

      <div className="h-px w-full bg-white/5" />

      {/* Content Area */}
      <div className="flex flex-col gap-6">
        {organizations.length === 0 && !loading ? (
          <div className="flex flex-col items-center justify-center p-20 bg-white/5 border border-dashed border-white/10 rounded-3xl gap-4">
            <Building2 size={48} className="text-slate-700" />
            <div className="text-center">
              <Text size="lg" weight="bold" className="text-slate-400 uppercase tracking-tighter italic">Sin Resultados</Text>
              <Text size="xs" variant="muted">Prueba con otra búsqueda o crea una nueva organización.</Text>
            </div>
          </div>
        ) : (
          <>
            {/* Desktop View */}
            <div className="hidden lg:block">
              <OrganizationTable
                organizations={organizations}
                loading={loading}
                onEdit={handleEdit}
                onAddSubscription={handleAddSubscription}
              />
            </div>

            {/* Mobile View */}
            <div className="lg:hidden grid grid-cols-1 md:grid-cols-2 gap-4">
              {loading ? (
                [1, 2, 3, 4].map(i => <div key={i} className="h-48 bg-white/5 rounded-2xl animate-pulse" />)
              ) : (
                organizations.map(org => (
                  <OrganizationCard
                    key={org.id}
                    organization={org}
                    onEdit={handleEdit}
                    onAddSubscription={handleAddSubscription}
                  />
                ))
              )}
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="flex items-center justify-center gap-6 pt-4 border-t border-white/5">
                <Button
                  variant="outlined"
                  size="sm"
                  leftIcon={<ChevronLeft size={16} />}
                  disabled={page <= 1}
                  onClick={() => setPage(p => Math.max(1, p - 1))}
                  className="bg-transparent border-white/5"
                >
                  ANTERIOR
                </Button>
                <Text size="xs" weight="bold" className="uppercase tracking-widest text-slate-500">
                  Página <span className="text-white">{page}</span> de <span className="text-white">{totalPages}</span>
                </Text>
                <Button
                  variant="outlined"
                  size="sm"
                  rightIcon={<ChevronRight size={16} />}
                  disabled={page >= totalPages}
                  onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                  className="bg-transparent border-white/5"
                >
                  SIGUIENTE
                </Button>
              </div>
            )}
          </>
        )}
      </div>

      {/* Shared Modals */}
      <OrganizationModal
        open={isEditModalOpen}
        onOpenChange={setIsEditModalOpen}
        organizationData={selectedOrg}
        onSuccess={loadOrganizations}
      />

      {selectedOrg && (
        <AddSubscriptionModal
          open={isSubModalOpen}
          onOpenChange={setIsSubModalOpen}
          organization={selectedOrg}
          onSuccess={loadOrganizations}
        />
      )}
    </div>
  );
}
