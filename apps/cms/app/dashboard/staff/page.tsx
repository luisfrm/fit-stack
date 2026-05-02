"use client";

import * as React from "react";
import { Plus, ChevronLeft, ChevronRight } from "lucide-react";
import {
  Button,
  toast,
} from "@workspace/ui/components";
import { type IMember } from "@/types/dashboard";
import { MembersTable } from "@/components/members/members-table";
import { StaffModal } from "@/components/staff/staff-modal";
import { membersService } from "@/lib/services/members-service";
import { DashboardHeader } from "@/components/dashboard/dashboard-header";
import { FilterPanel } from "@/components/dashboard/filter-panel";
import { useDebounce } from "@/lib/hooks/use-debounce";
import { ORG_ROLES } from "@workspace/shared";

export default function StaffPage() {
  const [staff, setStaff] = React.useState<IMember[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  // Filtros
  const [query, setQuery] = React.useState("");
  const [searchTerm, setSearchTerm] = React.useState("");
  const debouncedSearch = useDebounce(searchTerm, 500);

  // Paginación
  const [page, setPage] = React.useState(1);
  const [totalPages, setTotalPages] = React.useState(1);
  const limit = 10;

  const loadStaff = React.useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      // Usamos el nuevo filtro excludeRole para obtener Admins, Managers y Trainers
      const filters: any = {
        page,
        limit,
        excludeRole: ORG_ROLES.MEMBER
      };
      if (query) filters.query = query;

      const data = await membersService.getMembers(filters);
      setStaff(data.data);
      setTotalPages(data.totalPages || 1);
    } catch (err: any) {
      setError(err.message || "Error al cargar el personal administrativo");
    } finally {
      setLoading(false);
    }
  }, [page, limit, query]);

  React.useEffect(() => {
    loadStaff();
  }, [loadStaff]);

  // Sync debounced search with query
  React.useEffect(() => {
    setQuery(debouncedSearch);
    setPage(1);
  }, [debouncedSearch]);

  const handleDelete = async (id: number) => {
    try {
      await membersService.deleteMember(id);
      toast.success("Usuario de staff eliminado.");
      if (staff.length === 1 && page > 1) {
        setPage((prev) => prev - 1);
      } else {
        loadStaff();
      }
    } catch (err: any) {
      toast.error(err.message || "Fallo al eliminar staff");
    }
  };



  return (
    <div className="flex flex-col gap-6">
      <DashboardHeader
        title="Gestión de Staff"
        description="Administra los roles operativos del gimnasio (Admins, Managers y Trainers)."
        iconName="ShieldCheck"
      >
        <StaffModal
          trigger={
            <Button variant="primary" size="sm" leftIcon={<Plus size={18} />}>
              AÑADIR STAFF
            </Button>
          }
          onSuccess={() => loadStaff()}
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
              members={staff}
              onDelete={handleDelete}
              onSuccess={() => loadStaff()}
              loading={loading}
              EditModal={StaffModal}
              emptyDescription="Aún no se han registrado miembros del personal administrativo."
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
