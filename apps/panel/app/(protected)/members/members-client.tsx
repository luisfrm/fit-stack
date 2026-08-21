"use client";

import * as React from "react";
import { Button, toast } from "@workspace/ui/components";
import { Plus, ChevronLeft, ChevronRight } from "lucide-react";
import { useRouter } from "next/navigation";
import { type IMember } from "@workspace/shared/types";
import { MembersTable } from "@/components/members/members-table";
import { MemberModal } from "@/components/members/member-modal";
import { SubscriptionModal } from "@/components/payments/subscription-modal";
import { membersService } from "@/lib/services/members-service";
import { DashboardHeader } from "@/components/dashboard/dashboard-header";
import { FilterPanel } from "@/components/dashboard/filter-panel";
import { useDebounce } from "@/lib/hooks/use-debounce";

interface MembersClientProps {
  readonly initialMembers: IMember[];
  readonly initialPage: number;
  readonly initialTotalPages: number;
  readonly initialQuery: string;
  readonly limit: number;
  readonly onRefreshServer?: () => Promise<void>;
}

export function MembersClient({
  initialMembers,
  initialPage,
  initialTotalPages,
  initialQuery,
  limit,
  onRefreshServer,
}: MembersClientProps) {
  const router = useRouter();
  const [members, setMembers] = React.useState<IMember[]>(initialMembers);
  const [page, setPage] = React.useState(initialPage);
  const [totalPages, setTotalPages] = React.useState(initialTotalPages);
  const [searchTerm, setSearchTerm] = React.useState(initialQuery);
  const debouncedSearch = useDebounce(searchTerm, 500);
  const [deletingId, setDeletingId] = React.useState<number | null>(null);

  const refresh = React.useCallback(async () => {
    if (onRefreshServer) {
      await onRefreshServer();
    }
    router.refresh();
  }, [router, onRefreshServer]);

  React.useEffect(() => {
    if (debouncedSearch === initialQuery) return;
    const params = new URLSearchParams();
    if (debouncedSearch) params.set("query", debouncedSearch);
    params.set("page", "1");
    router.push(`/members?${params.toString()}`);
  }, [debouncedSearch, initialQuery, router]);

  React.useEffect(() => {
    setMembers(initialMembers);
    setPage(initialPage);
    setTotalPages(initialTotalPages);
  }, [initialMembers, initialPage, initialTotalPages]);

  const handleDelete = async (id: number) => {
    setDeletingId(id);
    try {
      await membersService.deleteMember(id);
      toast.success("Cliente eliminado.");
      if (members.length === 1 && page > 1) {
        const params = new URLSearchParams();
        if (initialQuery) params.set("query", initialQuery);
        params.set("page", String(page - 1));
        router.push(`/members?${params.toString()}`);
      } else {
        refresh();
      }
    } catch (error) {
      const message =
        (error as { data?: { error?: string }; message?: string }).data?.error ??
        (error as Error).message ??
        "Fallo al eliminar cliente";
      toast.error(message);
    } finally {
      setDeletingId(null);
    }
  };

  const setPageAndNavigate = (newPage: number) => {
    const params = new URLSearchParams();
    if (initialQuery) params.set("query", initialQuery);
    params.set("page", String(newPage));
    router.push(`/members?${params.toString()}`);
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
          <MembersTable
            members={members}
            onDelete={handleDelete}
            onSuccess={refresh}
            SubscriptionModal={SubscriptionModal}
            hideRoleColumn={true}
            loading={false}
            emptyDescription="Aún no se han registrado clientes en esta organización."
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
        <span className="sr-only">Eliminando cliente {deletingId}</span>
      )}
    </div>
  );
}
