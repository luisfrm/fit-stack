"use client";

import * as React from "react";
import {
  Button,
  toast,
} from "@workspace/ui/components";
import { Plus, ChevronLeft, ChevronRight } from "lucide-react";
import { type IMember } from "@/types/dashboard";
import { MembersTable } from "@/components/members/members-table";
import { MemberModal } from "@/components/members/member-modal";
import { SubscriptionModal } from "@/components/payments/subscription-modal";
import { membersService } from "@/lib/services/members-service";
import { DashboardHeader } from "@/components/dashboard/dashboard-header";
import { FilterPanel } from "@/components/dashboard/filter-panel";
import { useDebounce } from "@/lib/hooks/use-debounce";
import { ORG_ROLES } from "@workspace/shared";

export default function MembersPage() {
  const [members, setMembers] = React.useState<IMember[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  // Filtros
  const [query, setQuery] = React.useState("");
  const [searchTerm, setSearchTerm] = React.useState("");
  const debouncedSearch = useDebounce(searchTerm, 500);
  const role = ORG_ROLES.MEMBER; // Fuerza el rol de cliente

  // Paginación
  const [page, setPage] = React.useState(1);
  const [totalPages, setTotalPages] = React.useState(1);
  const limit = 10;

  const loadMembers = React.useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      const filters: any = { page, limit, role, includeLatestSubscription: true };
      if (query) filters.query = query;

      const data = await membersService.getMembers(filters);
      setMembers(data.data);
      setTotalPages(data.totalPages || 1);
    } catch (err: any) {
      setError(err.message || "Error al cargar clientes");
    } finally {
      setLoading(false);
    }
  }, [page, limit, query, role]);

  React.useEffect(() => {
    loadMembers();
  }, [loadMembers]);

  // Sync debounced search with query
  React.useEffect(() => {
    setQuery(debouncedSearch);
    setPage(1);
  }, [debouncedSearch]);

  const handleDelete = async (id: number) => {
    try {
      await membersService.deleteMember(id);
      toast.success("Cliente eliminado.");
      if (members.length === 1 && page > 1) {
        setPage((prev) => prev - 1);
      } else {
        loadMembers();
      }
    } catch (err: any) {
      toast.error(err.message || "Fallo al eliminar cliente");
    }
  };

  return (
    <div className="flex flex-col gap-6">
      <DashboardHeader
        title="Clientes"
        description="Administra los usuarios registrados en tu plataforma como miembros activos."
        iconName="Users"
      >
        <MemberModal
          trigger={
            <Button variant="primary" size="sm" leftIcon={<Plus size={18} />}>
              NUEVO CLIENTE
            </Button>
          }
          onSuccess={() => loadMembers()}
        />
      </DashboardHeader>

      {/* Panel de Filtros */}
      <FilterPanel
        searchValue={searchTerm}
        onSearchChange={setSearchTerm}
        searchPlaceholder="Buscar por nombre, email..."
      />

      {/* Tabla */}
      <section>
        {error ? (
          <div className="flex items-center justify-center p-12 text-destructive bg-destructive/10 rounded-xl">
            {error}
          </div>
        ) : (
          <div className="space-y-6">
            <MembersTable
              members={members}
              onDelete={handleDelete}
              onSuccess={() => loadMembers()}
              SubscriptionModal={SubscriptionModal}
              hideRoleColumn={true}
              loading={loading}
              emptyDescription="Aún no se han registrado clientes en esta organización."
            />

            {/* Paginación */}
            {totalPages > 1 && (
              <div className="flex items-center justify-center pt-2 gap-4">
                <Button
                  variant="outlined"
                  size="sm"
                  leftIcon={<ChevronLeft className="w-4 h-4" />}
                  disabled={page <= 1}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                >
                  Anterior
                </Button>
                <div className="text-sm text-slate-400 font-medium">
                  Página {page} de {totalPages}
                </div>
                <Button
                  variant="outlined"
                  size="sm"
                  rightIcon={<ChevronRight className="w-4 h-4" />}
                  disabled={page >= totalPages}
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                >
                  Siguiente
                </Button>
              </div>
            )}
          </div>
        )}
      </section>
    </div>
  );
}
