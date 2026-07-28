"use client";

import * as React from "react";
import { Button, toast } from "@workspace/ui/components";
import { Plus, ChevronLeft, ChevronRight } from "lucide-react";
import { useRouter } from "next/navigation";
import { type IMember } from "@workspace/shared/types";
import { StaffTable } from "@/components/staff/staff-table";
import { StaffModal } from "@/components/staff/staff-modal";
import { membersService } from "@/lib/services/members-service";
import { DashboardHeader } from "@/components/dashboard/dashboard-header";
import { FilterPanel } from "@/components/dashboard/filter-panel";
import { useDebounce } from "@/lib/hooks/use-debounce";

interface StaffClientProps {
  readonly initialStaff: IMember[];
  readonly initialPage: number;
  readonly initialTotalPages: number;
  readonly initialQuery: string;
  readonly limit: number;
}

export function StaffClient({
  initialStaff,
  initialPage,
  initialTotalPages,
  initialQuery,
  limit,
}: StaffClientProps) {
  const router = useRouter();
  const [staff, setStaff] = React.useState<IMember[]>(initialStaff);
  const [page, setPage] = React.useState(initialPage);
  const [totalPages, setTotalPages] = React.useState(initialTotalPages);
  const [searchTerm, setSearchTerm] = React.useState(initialQuery);
  const debouncedSearch = useDebounce(searchTerm, 500);
  const [deletingId, setDeletingId] = React.useState<number | null>(null);

  const refresh = React.useCallback(() => {
    router.refresh();
  }, [router]);

  React.useEffect(() => {
    if (debouncedSearch === initialQuery) return;
    const params = new URLSearchParams();
    if (debouncedSearch) params.set("query", debouncedSearch);
    params.set("page", "1");
    router.push(`/dashboard/staff?${params.toString()}`);
  }, [debouncedSearch, initialQuery, router]);

  React.useEffect(() => {
    setStaff(initialStaff);
    setPage(initialPage);
    setTotalPages(initialTotalPages);
  }, [initialStaff, initialPage, initialTotalPages]);

  const handleDelete = async (id: number) => {
    setDeletingId(id);
    try {
      await membersService.deleteMember(id);
      toast.success("Usuario de staff eliminado.");
      if (staff.length === 1 && page > 1) {
        const params = new URLSearchParams();
        if (initialQuery) params.set("query", initialQuery);
        params.set("page", String(page - 1));
        router.push(`/dashboard/staff?${params.toString()}`);
      } else {
        refresh();
      }
    } catch (error) {
      const message =
        (error as { data?: { error?: string }; message?: string }).data?.error ??
        (error as Error).message ??
        "Fallo al eliminar staff";
      toast.error(message);
    } finally {
      setDeletingId(null);
    }
  };

  const setPageAndNavigate = (newPage: number) => {
    const params = new URLSearchParams();
    if (initialQuery) params.set("query", initialQuery);
    params.set("page", String(newPage));
    router.push(`/dashboard/staff?${params.toString()}`);
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
          onSuccess={refresh}
        />
      </DashboardHeader>

      <FilterPanel
        searchValue={searchTerm}
        onSearchChange={setSearchTerm}
        searchPlaceholder="Buscar por nombre, email..."
      />

      <section>
        <div className="space-y-6">
          <StaffTable
            staff={staff}
            onDelete={handleDelete}
            onSuccess={refresh}
            loading={false}
            EditModal={StaffModal}
            emptyDescription="Aún no se han registrado miembros del staff."
          />

          {totalPages > 1 && (
            <div className="flex items-center justify-center pt-2 gap-4">
              <Button
                variant="outlined"
                size="sm"
                leftIcon={<ChevronLeft className="w-4 h-4" />}
                disabled={page <= 1}
                onClick={() => setPageAndNavigate(Math.max(1, page - 1))}
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
                onClick={() => setPageAndNavigate(Math.min(totalPages, page + 1))}
              >
                Siguiente
              </Button>
            </div>
          )}
        </div>
      </section>

      {deletingId !== null && (
        <span className="sr-only">Eliminando staff {deletingId}</span>
      )}

      <span className="sr-only">Límite {limit}</span>
    </div>
  );
}
