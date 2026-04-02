"use client";

import * as React from "react";
import { Dumbbell, Plus, Filter, Search, ChevronLeft, ChevronRight } from "lucide-react";
import { Button, Text, CoachCard, AddCoachCard, Skeleton, ConfirmationModal, toast } from "@workspace/ui/components";
import { CoachModal } from "@/components/coaches/coach-modal";
import { membersService } from "@/lib/services/members-service";
import {
  useDeleteCoachMutation,
  useUpdateCoachMutation
} from "@/lib/services/coaches-service";
import { type CoachFilter, type ICoach } from "@/types/dashboard";
import { useCoaches } from "@/lib/hooks/use-trainers";
import { DashboardHeader } from "@/components/dashboard/dashboard-header";
import { getMediaUrl } from "@/lib/utils/media-utils";
import { NoData } from "@/components/dashboard/dashboard-ui";

const ITEMS_PER_PAGE = 10;

export default function TrainersPage() {
  const [filters, setFilters] = React.useState<CoachFilter>({
    page: 1,
    limit: ITEMS_PER_PAGE,
  });
  const [searchInput, setSearchInput] = React.useState("");

  // For editing
  const [coachToEdit, setCoachToEdit] = React.useState<ICoach | undefined>(undefined);
  const [coachToDelete, setCoachToDelete] = React.useState<ICoach | undefined>(undefined);
  const [isEditModalOpen, setIsEditModalOpen] = React.useState(false);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = React.useState(false);
  const [resendingCoachId, setResendingCoachId] = React.useState<number | null>(null);

  // React Query fetch
  const { data: result = { data: [], total: 0, page: 1, limit: ITEMS_PER_PAGE, totalPages: 0 }, isLoading } = useCoaches(filters);

  // Debounced search
  React.useEffect(() => {
    const timeout = setTimeout(() => {
      setFilters((prev) => ({ ...prev, name: searchInput || undefined, page: 1 }));
    }, 400);
    return () => clearTimeout(timeout);
  }, [searchInput]);

  // Mutations from service
  const deleteMutation = useDeleteCoachMutation();
  const updateMutation = useUpdateCoachMutation();

  const handlePageChange = (newPage: number) => {
    setFilters((prev) => ({ ...prev, page: newPage }));
  };

  const handleEdit = (coach: ICoach) => {
    setCoachToEdit(coach);
    setIsEditModalOpen(true);
  };

  const handleToggleVisibility = (coach: ICoach, isVisible: boolean) => {
    if (!coach.id) return;
    updateMutation.mutate({ id: coach.id, data: { isVisible } });
  };

  const handleDelete = (coach: ICoach) => {
    setCoachToDelete(coach);
    setIsDeleteModalOpen(true);
  };

  const confirmDelete = async () => {
    if (!coachToDelete?.id) return;
    try {
      await deleteMutation.mutateAsync(coachToDelete.id);
    } catch (error) {
      console.error("Error deleting coach:", error);
    } finally {
      setIsDeleteModalOpen(false);
      setCoachToDelete(undefined);
    }
  };

  const handleResendInvite = async (coach: ICoach) => {
    if (!coach.id) return;
    setResendingCoachId(coach.id);
    try {
      await membersService.resendInvite(coach.id);
      toast.success(`Invitación reenviada a ${coach.email}`);
    } catch (error: any) {
      toast.error(error.response?.data?.error || "Error al reenviar invitación");
    } finally {
      setResendingCoachId(null);
    }
  };

  const renderContent = () => {
    if (isLoading) {
      return (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
          {[1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="aspect-4/5 w-full rounded-xl" />
          ))}
        </div>
      );
    }

    if (result.data.length === 0) {
      if (!searchInput) {
        return (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
            <CoachModal trigger={<AddCoachCard />} />
          </div>
        );
      }
      return (
        <NoData
          message="No hay entrenadores registrados. Intenta ajustando los filtros o añade uno nuevo."
          className="py-20"
        />
      );
    }

    return (
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
        {result.data.map((coach) => (
          <CoachCard
            key={coach.id}
            firstName={coach.firstName}
            lastName={coach.lastName}
            role={coach.role?.name}
            specialities={coach.specialities}
            imageUrl={coach.imageUrl ? getMediaUrl(coach.imageUrl) : null}
            isVisible={coach.isVisible}
            hasUser={!!coach.user}
            onEdit={() => handleEdit(coach)}
            onDelete={() => handleDelete(coach)}
            onToggleVisibility={(visible) => handleToggleVisibility(coach, visible)}
            onResendInvite={() => handleResendInvite(coach)}
            isResendingInvite={resendingCoachId === coach.id}
          />
        ))}
        {filters.page === 1 && !searchInput && !filters.isVisible && (
          <CoachModal trigger={<AddCoachCard />} />
        )}
      </div>
    );
  };

  return (
    <>
      {/* ── Header ── */}
      <DashboardHeader
        title="Entrenadores"
        description="Gestión de entrenadores y perfiles del gimnasio."
        iconName="Dumbbell"
      >
        <CoachModal
          trigger={
            <Button variant="primary" size="sm" leftIcon={<Plus className="w-4 h-4" />}>
              Nuevo Entrenador
            </Button>
          }
        />
      </DashboardHeader>

      {/* ── Filters ── */}
      <div className="flex flex-col md:flex-row gap-4 mb-8">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 w-4 h-4" />
          <input
            type="text"
            placeholder="Buscar por nombre..."
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            className="w-full bg-white/5 border border-white/10 rounded-lg py-2 pl-10 pr-4 text-sm text-slate-200 outline-none focus:ring-1 focus:ring-primary placeholder:text-slate-600 transition-all"
          />
        </div>
        <div className="flex gap-2">
          <Button
            variant={filters.isVisible === true ? "primary" : "glass"}
            size="sm"
            leftIcon={<Filter className="w-4 h-4" />}
            onClick={() =>
              setFilters((prev) => ({
                ...prev,
                isVisible: prev.isVisible === true ? undefined : true,
                page: 1,
              }))
            }
          >
            Visibles
          </Button>
          <Button
            variant={filters.isVisible === false ? "primary" : "glass"}
            size="sm"
            onClick={() =>
              setFilters((prev) => ({
                ...prev,
                isVisible: prev.isVisible === false ? undefined : false,
                page: 1,
              }))
            }
          >
            Ocultos
          </Button>
        </div>
      </div>

      {/* ── Listado ── */}
      <section className="animate-in fade-in slide-in-from-bottom-3 duration-500">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2 text-slate-400">
            <Dumbbell size={18} />
            <Text size="sm" weight="bold" className="uppercase tracking-widest">
              Staff Oficial
            </Text>
          </div>
          {!isLoading && (
            <Text size="xs" variant="muted">
              {result.total} entrenador{result.total === 1 ? "" : "es"} encontrad{result.total === 1 ? "o" : "os"}
            </Text>
          )}
        </div>

        {renderContent()}

        {/* ── Pagination ── */}
        {result.totalPages > 1 && (
          <div className="flex items-center justify-between mt-6 px-1">
            <Text size="sm" variant="muted">
              Página {result.page} de {result.totalPages}
            </Text>
            <div className="flex gap-2">
              <Button
                variant="glass"
                size="sm"
                disabled={result.page <= 1}
                leftIcon={<ChevronLeft className="w-4 h-4" />}
                onClick={() => handlePageChange(result.page - 1)}
              >
                Anterior
              </Button>
              <Button
                variant="glass"
                size="sm"
                disabled={result.page >= result.totalPages}
                onClick={() => handlePageChange(result.page + 1)}
              >
                Siguiente <ChevronRight className="w-4 h-4 ml-1" />
              </Button>
            </div>
          </div>
        )}
      </section>

      {/* ── Modal de Eliminación ── */}
      <ConfirmationModal
        open={isDeleteModalOpen}
        onOpenChange={setIsDeleteModalOpen}
        title="¿Eliminar entrenador?"
        description={`Esta acción eliminará permanentemente a ${coachToDelete?.firstName} y todos sus datos asociados (perfil, suscripciones, pagos y rutinas). Esta acción no se puede deshacer.`}
        confirmText="Eliminar permanentemente"
        variant="danger"
        onConfirm={confirmDelete}
      />

      {/* ── Modal de Edición ── */}
      <CoachModal
        initialData={coachToEdit}
        open={isEditModalOpen}
        onOpenChange={setIsEditModalOpen}
        onSuccess={() => { }}
      />
    </>
  );
}
