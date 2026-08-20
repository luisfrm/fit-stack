"use client";

import * as React from "react";
import { Dumbbell, Plus, Filter, ChevronLeft, ChevronRight } from "lucide-react";
import {
  Button,
  Text,
  TrainerCard,
  AddTrainerCard,
  Skeleton,
  ConfirmationModal,
  toast,
} from "@workspace/ui/components";
import { useRouter } from "next/navigation";
import { TrainerModal } from "@/components/trainers/trainer-modal";
import { membersService } from "@/lib/services/members-service";
import { trainersService } from "@/lib/services/trainers-service";
import { type ITrainer } from "@workspace/shared/types";
import { uploadService } from "@/lib/services/upload-service";
import { NoData } from "@/components/dashboard/no-data";
import { FilterPanel } from "@/components/dashboard/filter-panel";
import { useDebounce } from "@/lib/hooks/use-debounce";
import { DashboardHeader } from "@/components/dashboard/dashboard-header";

interface TrainersClientProps {
  readonly initialTrainers: ITrainer[];
  readonly initialPage: number;
  readonly initialTotalPages: number;
  readonly initialTotal: number;
  readonly initialQuery: string;
  readonly initialVisibility: "all" | "visible" | "hidden";
  readonly limit: number;
}

type VisibilityFilter = "all" | "visible" | "hidden";

export function TrainersClient({
  initialTrainers,
  initialPage,
  initialTotalPages,
  initialTotal,
  initialQuery,
  initialVisibility,
  limit,
}: TrainersClientProps) {
  const router = useRouter();
  const [searchTerm, setSearchTerm] = React.useState(initialQuery);
  const debouncedSearch = useDebounce(searchTerm, 500);
  const [trainerToEdit, setTrainerToEdit] = React.useState<ITrainer | undefined>(undefined);
  const [trainerToDelete, setTrainerToDelete] = React.useState<ITrainer | undefined>(undefined);
  const [isEditModalOpen, setIsEditModalOpen] = React.useState(false);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = React.useState(false);
  const [resendingTrainerId, setResendingTrainerId] = React.useState<number | null>(null);
  const [visibility, setVisibility] = React.useState<VisibilityFilter>(initialVisibility);
  const [togglingId, setTogglingId] = React.useState<number | null>(null);

  const refresh = React.useCallback(() => {
    router.refresh();
  }, [router]);

  React.useEffect(() => {
    if (debouncedSearch === initialQuery) return;
    const params = new URLSearchParams();
    if (debouncedSearch) params.set("query", debouncedSearch);
    params.set("page", "1");
    if (visibility === "visible") params.set("isVisible", "true");
    if (visibility === "hidden") params.set("isVisible", "false");
    router.push(`/dashboard/trainers?${params.toString()}`);
  }, [debouncedSearch, initialQuery, router, visibility]);

  const navigatePage = (newPage: number) => {
    const params = new URLSearchParams();
    if (initialQuery) params.set("query", initialQuery);
    if (visibility === "visible") params.set("isVisible", "true");
    if (visibility === "hidden") params.set("isVisible", "false");
    params.set("page", String(newPage));
    router.push(`/dashboard/trainers?${params.toString()}`);
  };

  const toggleVisibility = (isVisible: "all" | "visible" | "hidden") => {
    const next = isVisible;
    setVisibility(next);
    const params = new URLSearchParams();
    if (initialQuery) params.set("query", initialQuery);
    if (next === "visible") params.set("isVisible", "true");
    if (next === "hidden") params.set("isVisible", "false");
    params.set("page", "1");
    router.push(`/dashboard/trainers?${params.toString()}`);
  };

  const handleToggleVisibility = async (trainer: ITrainer, isVisible: boolean) => {
    if (!trainer.id) return;
    setTogglingId(trainer.id);
    try {
      await trainersService.updateTrainer(trainer.id, { isVisible });
      toast.success(`Entrenador ${isVisible ? "visible" : "oculto"}`);
      router.refresh();
    } catch (error) {
      const message =
        (error as { data?: { error?: string }; message?: string }).data?.error ??
        "Error al actualizar visibilidad";
      toast.error(message);
    } finally {
      setTogglingId(null);
    }
  };

  const confirmDelete = async () => {
    if (!trainerToDelete?.id) return;
    try {
      await trainersService.deleteTrainer(trainerToDelete.id);
      toast.success("Entrenador eliminado");
      setIsDeleteModalOpen(false);
      setTrainerToDelete(undefined);
      router.refresh();
    } catch (error) {
      const message =
        (error as { data?: { error?: string }; message?: string }).data?.error ??
        "Error al eliminar entrenador";
      toast.error(message);
    }
  };

  const handleResendInvite = async (trainer: ITrainer) => {
    if (!trainer.id) return;
    setResendingTrainerId(trainer.id);
    try {
      await membersService.resendInvite(trainer.id);
      toast.success(`Invitación reenviada a ${trainer.email}`);
    } catch (error) {
      const message =
        (error as { data?: { error?: string }; message?: string }).data?.error ??
        "Error al reenviar invitación";
      toast.error(message);
    } finally {
      setResendingTrainerId(null);
    }
  };

  const renderContent = () => {
    if (initialTrainers.length === 0) {
      if (!debouncedSearch) {
        return (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
            <TrainerModal trigger={<AddTrainerCard />} onSuccess={refresh} />
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
        {initialTrainers.map((trainer) => (
          <TrainerCard
            key={trainer.id}
            firstName={trainer.firstName}
            lastName={trainer.lastName}
            role={trainer.role}
            specialities={trainer.specialities}
            imageUrl={trainer.imageUrl ? uploadService.getMediaUrl(trainer.imageUrl) : null}
            isVisible={trainer.isVisible}
            hasUser={!!trainer.user}
            onEdit={() => {
              setTrainerToEdit(trainer);
              setIsEditModalOpen(true);
            }}
            onDelete={() => {
              setTrainerToDelete(trainer);
              setIsDeleteModalOpen(true);
            }}
            onToggleVisibility={(visible) => handleToggleVisibility(trainer, visible)}
            onResendInvite={() => handleResendInvite(trainer)}
            isResendingInvite={resendingTrainerId === trainer.id}
          />
        ))}
        {initialPage === 1 && !debouncedSearch && visibility === "all" && (
          <TrainerModal trigger={<AddTrainerCard />} onSuccess={refresh} />
        )}
      </div>
    );
  };

  return (
    <>
      <DashboardHeader
        title="Entrenadores"
        description="Gestión de entrenadores y perfiles del gimnasio."
        iconName="Dumbbell"
      >
        <TrainerModal
          trigger={
            <Button variant="primary" size="sm" leftIcon={<Plus className="w-4 h-4" />}>
              Nuevo Entrenador
            </Button>
          }
          onSuccess={refresh}
        />
      </DashboardHeader>

      <FilterPanel
        searchValue={searchTerm}
        onSearchChange={setSearchTerm}
        searchPlaceholder="Buscar por nombre..."
        className="mb-8"
      >
        <div className="flex gap-2">
          <Button
            variant={visibility === "visible" ? "primary" : "glass"}
            size="sm"
            leftIcon={<Filter className="w-4 h-4" />}
            onClick={() => toggleVisibility(visibility === "visible" ? "all" : "visible")}
          >
            Visibles
          </Button>
          <Button
            variant={visibility === "hidden" ? "primary" : "glass"}
            size="sm"
            onClick={() => toggleVisibility(visibility === "hidden" ? "all" : "hidden")}
          >
            Ocultos
          </Button>
        </div>
      </FilterPanel>

      <section className="animate-in fade-in slide-in-from-bottom-3 duration-500">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2 text-slate-400">
            <Dumbbell size={18} />
            <Text size="sm" weight="bold" className="uppercase tracking-widest">
              Staff Oficial
            </Text>
          </div>
          <Text size="xs" variant="muted">
            {initialTotal} entrenador{initialTotal === 1 ? "" : "es"} encontrad{initialTotal === 1 ? "o" : "os"}
          </Text>
        </div>

        {renderContent()}

        {initialTotalPages > 1 && (
          <div className="flex items-center justify-between mt-6 px-1">
            <Text size="sm" variant="muted">
              Página {initialPage} de {initialTotalPages}
            </Text>
            <div className="flex gap-2">
              <Button
                variant="glass"
                size="sm"
                disabled={initialPage <= 1}
                leftIcon={<ChevronLeft className="w-4 h-4" />}
                onClick={() => navigatePage(initialPage - 1)}
              >
                Anterior
              </Button>
              <Button
                variant="glass"
                size="sm"
                disabled={initialPage >= initialTotalPages}
                onClick={() => navigatePage(initialPage + 1)}
              >
                Siguiente <ChevronRight className="w-4 h-4 ml-1" />
              </Button>
            </div>
          </div>
        )}
      </section>

      <ConfirmationModal
        open={isDeleteModalOpen}
        onOpenChange={setIsDeleteModalOpen}
        title="¿Eliminar entrenador?"
        description={`Esta acción eliminará permanentemente a ${trainerToDelete?.firstName} y todos sus datos asociados (perfil, suscripciones, pagos y rutinas). Esta acción no se puede deshacer.`}
        confirmText="Eliminar permanentemente"
        variant="danger"
        onConfirm={confirmDelete}
      />

      <TrainerModal
        initialData={trainerToEdit}
        open={isEditModalOpen}
        onOpenChange={setIsEditModalOpen}
        onSuccess={refresh}
      />

      {(togglingId !== null || resendingTrainerId !== null) && (
        <div className="sr-only">
          <Skeleton className="h-2 w-2" />
        </div>
      )}

      <span className="sr-only">Límite {limit}</span>
    </>
  );
}
