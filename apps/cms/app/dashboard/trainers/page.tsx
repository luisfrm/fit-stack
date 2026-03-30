"use client";

import * as React from "react";
import { Dumbbell, Plus, Filter, Search, Loader2, ChevronLeft, ChevronRight } from "lucide-react";
import { Button, Text, toast } from "@workspace/ui/components";
import { CoachesTable } from "@/components/coaches/coaches-table";
import { CoachModal } from "@/components/coaches/coach-modal";
import { coachesService } from "@/lib/services/coaches-service";
import { type CoachFilter, type PaginatedCoaches, type ICoach } from "@/types/dashboard";

const ITEMS_PER_PAGE = 10;

export default function TrainersPage() {
  const [result, setResult] = React.useState<PaginatedCoaches>({
    data: [],
    total: 0,
    page: 1,
    limit: ITEMS_PER_PAGE,
    totalPages: 0,
  });
  const [isLoading, setIsLoading] = React.useState(true);
  const [filters, setFilters] = React.useState<CoachFilter>({
    page: 1,
    limit: ITEMS_PER_PAGE,
  });
  const [searchInput, setSearchInput] = React.useState("");
  
  // For editing
  const [coachToEdit, setCoachToEdit] = React.useState<ICoach | undefined>(undefined);
  const [isEditModalOpen, setIsEditModalOpen] = React.useState(false);

  const fetchCoaches = React.useCallback(async (activeFilters: CoachFilter) => {
    setIsLoading(true);
    try {
      const data = await coachesService.getCoaches(activeFilters);
      setResult(data);
    } catch (error: any) {
      const message = error.response?.data?.error ?? error.message ?? "No se pudo conectar con el servidor";
      toast.error(message);
    } finally {
      setIsLoading(false);
    }
  }, []);

  React.useEffect(() => {
    fetchCoaches(filters);
  }, [filters, fetchCoaches]);

  React.useEffect(() => {
    const timeout = setTimeout(() => {
      setFilters((prev) => ({ ...prev, name: searchInput || undefined, page: 1 }));
    }, 400);
    return () => clearTimeout(timeout);
  }, [searchInput]);

  const handleDelete = async (coach: ICoach) => {
    if (!confirm(`¿Estás seguro de que deseas eliminar al entrenador ${coach.name}?`)) return;

    if (!coach.id) return;

    try {
      await coachesService.deleteCoach(coach.id);
      toast.success("Entrenador eliminado correctamente");
      fetchCoaches(filters);
    } catch (error: any) {
      const message = error.response?.data?.error ?? error.message ?? "Error al eliminar entrenador";
      toast.error(message);
    }
  };

  const handleEdit = (coach: ICoach) => {
    setCoachToEdit(coach);
    setIsEditModalOpen(true);
  };

  const handlePageChange = (newPage: number) => {
    setFilters((prev) => ({ ...prev, page: newPage }));
  };

  return (
    <>
      {/* ── Header ── */}
      <header className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-10">
        <div>
          <h2 className="text-2xl lg:text-3xl font-bold text-slate-100 italic tracking-tight">Entrenadores</h2>
          <Text variant="muted">Gestión de entrenadores y perfiles del gimnasio.</Text>
        </div>
        <div className="flex gap-3">
          <CoachModal
            onSuccess={() => fetchCoaches(filters)}
            trigger={
              <Button variant="primary" size="sm" leftIcon={<Plus className="w-4 h-4" />}>
                Nuevo Entrenador
              </Button>
            }
          />
        </div>
      </header>

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

        {isLoading ? (
          <div className="flex flex-col items-center justify-center py-20 gap-3 text-slate-500">
            <Loader2 className="w-8 h-8 animate-spin text-primary" />
            <Text>Cargando entrenadores...</Text>
          </div>
        ) : (
          <>
            <CoachesTable
              coaches={result.data}
              onEdit={handleEdit}
              onDelete={handleDelete}
            />

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
          </>
        )}
      </section>

      {/* ── Modal de Edición ── */}
      <CoachModal
        initialData={coachToEdit}
        open={isEditModalOpen}
        onOpenChange={setIsEditModalOpen}
        onSuccess={() => fetchCoaches(filters)}
      />
    </>
  );
}
