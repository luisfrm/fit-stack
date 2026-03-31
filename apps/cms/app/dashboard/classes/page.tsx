"use client";

import * as React from "react";
import { CalendarDays, Plus, Filter, Search, ChevronLeft, ChevronRight } from "lucide-react";
import { Button, Text, toast } from "@workspace/ui/components";
import { ClassesTable } from "@/components/classes/classes-table";
import { ClassModal } from "@/components/classes/class-modal";
import { classesService, type ClassesFilter, type PaginatedClasses } from "@/lib/services/classes-service";

const ITEMS_PER_PAGE = 10;

export default function ClassesPage() {
  const [result, setResult] = React.useState<PaginatedClasses>({
    data: [],
    total: 0,
    page: 1,
    limit: ITEMS_PER_PAGE,
    totalPages: 0,
  });
  const [isLoading, setIsLoading] = React.useState(true);
  const [filters, setFilters] = React.useState<ClassesFilter>({
    page: 1,
    limit: ITEMS_PER_PAGE,
  });
  const [searchInput, setSearchInput] = React.useState("");

  const fetchClasses = React.useCallback(async (activeFilters: ClassesFilter) => {
    setIsLoading(true);
    try {
      const data = await classesService.getClasses(activeFilters);
      setResult(data);
    } catch (error: any) {
      const message = error.response?.data?.error ?? error.message ?? "No se pudo conectar con el servidor";
      toast.error(message);
    } finally {
      setIsLoading(false);
    }
  }, []);

  React.useEffect(() => {
    fetchClasses(filters);
  }, [filters, fetchClasses]);

  // Search with debounce — fires 400ms after user stops typing
  React.useEffect(() => {
    const timeout = setTimeout(() => {
      setFilters(prev => ({ ...prev, name: searchInput || undefined, page: 1 }));
    }, 400);
    return () => clearTimeout(timeout);
  }, [searchInput]);

  const handleDelete = async (id: number) => {
    if (!confirm("¿Estás seguro de que deseas eliminar esta clase?")) return;

    try {
      await classesService.deleteClass(id);
      toast.success("Clase eliminada correctamente");
      fetchClasses(filters);
    } catch (error: any) {
      const message = error.response?.data?.error ?? error.message ?? "Error al eliminar la clase";
      toast.error(message);
    }
  };

  const handlePageChange = (newPage: number) => {
    setFilters(prev => ({ ...prev, page: newPage }));
  };

  return (
    <>
      {/* ── Header ── */}
      <header className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-10">
        <div>
          <h2 className="text-2xl lg:text-3xl font-bold text-slate-100 italic tracking-tight">Gestión de Clases</h2>
          <Text variant="muted">Administra el horario y la visibilidad de tus clases diarias.</Text>
        </div>
        <div className="flex gap-3">
          <ClassModal
            onSuccess={() => fetchClasses(filters)}
            trigger={
              <Button variant="primary" size="sm" leftIcon={<Plus className="w-4 h-4" />}>
                Nueva Clase
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
            placeholder="Buscar clase o entrenador..."
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
              setFilters(prev => ({
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
              setFilters(prev => ({
                ...prev,
                isVisible: prev.isVisible === false ? undefined : false,
                page: 1,
              }))
            }
          >
            Ocultas
          </Button>
        </div>
      </div>

      {/* ── Classes List ── */}
      <section className="animate-in fade-in slide-in-from-bottom-3 duration-500">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2 text-slate-400">
            <CalendarDays size={18} />
            <Text size="sm" weight="bold" className="uppercase tracking-widest">Listado de Clases</Text>
          </div>
          {!isLoading && (
            <Text size="xs" variant="muted">{result.total} clase{result.total === 1 ? "" : "s"} encontrada{result.total === 1 ? "" : "s"}</Text>
          )}
        </div>

        <ClassesTable
          classes={result.data}
          onDelete={handleDelete}
          onUpdate={() => fetchClasses(filters)}
          loading={isLoading}
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
      </section>
    </>
  );
}
