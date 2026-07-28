"use client";

import * as React from "react";
import { CalendarDays, Plus, Filter, Search, ChevronLeft, ChevronRight } from "lucide-react";
import { Button, Text } from "@workspace/ui/components";
import { ClassesTable } from "@/components/classes/classes-table";
import { ClassModal } from "@/components/classes/class-modal";
import { type ClassesFilter } from "@/lib/services/classes-service";
import { DashboardHeader } from "@/components/dashboard/dashboard-header";
import { useClasses, useDeleteClass } from "@/lib/hooks/use-classes";

const ITEMS_PER_PAGE = 10;

export default function ClassesPage() {
  const [filters, setFilters] = React.useState<ClassesFilter>({
    page: 1,
    limit: ITEMS_PER_PAGE,
  });
  const [searchInput, setSearchInput] = React.useState("");

  const { data: result, isLoading } = useClasses(filters);
  const deleteMutation = useDeleteClass();

  React.useEffect(() => {
    const timeout = setTimeout(() => {
      setFilters(prev => {
        const nextName = searchInput || undefined;
        if (prev.name === nextName) return prev;
        return { ...prev, name: nextName, page: 1 };
      });
    }, 400);
    return () => clearTimeout(timeout);
  }, [searchInput]);

  const handleDelete = (id: number) => {
    if (!confirm("¿Estás seguro de que deseas eliminar esta clase?")) return;
    deleteMutation.mutate(id);
  };

  const handlePageChange = (newPage: number) => {
    setFilters(prev => ({ ...prev, page: newPage }));
  };

  const displayResult = result ?? {
    data: [],
    total: 0,
    page: 1,
    limit: ITEMS_PER_PAGE,
    totalPages: 0,
  };

  return (
    <>
      <DashboardHeader
        title="Gestión de Clases"
        description="Administra el horario y la visibilidad de tus clases diarias."
        iconName="CalendarDays"
      >
        <ClassModal
          trigger={
            <Button variant="primary" size="sm" leftIcon={<Plus className="w-4 h-4" />}>
              Nueva Clase
            </Button>
          }
        />
      </DashboardHeader>

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

      <section className="animate-in fade-in slide-in-from-bottom-3 duration-500">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2 text-slate-400">
            <CalendarDays size={18} />
            <Text size="sm" weight="bold" className="uppercase tracking-widest">Listado de Clases</Text>
          </div>
          {!isLoading && (
            <Text size="xs" variant="muted">
              {displayResult.total} clase{displayResult.total === 1 ? "" : "s"} encontrada{displayResult.total === 1 ? "" : "s"}
            </Text>
          )}
        </div>

        <ClassesTable
          classes={displayResult.data}
          onDelete={handleDelete}
          loading={isLoading}
        />

        {displayResult.totalPages > 1 && (
          <div className="flex items-center justify-between mt-6 px-1">
            <Text size="sm" variant="muted">
              Página {displayResult.page} de {displayResult.totalPages}
            </Text>
            <div className="flex gap-2">
              <Button
                variant="glass"
                size="sm"
                disabled={displayResult.page <= 1}
                leftIcon={<ChevronLeft className="w-4 h-4" />}
                onClick={() => handlePageChange(displayResult.page - 1)}
              >
                Anterior
              </Button>
              <Button
                variant="glass"
                size="sm"
                disabled={displayResult.page >= displayResult.totalPages}
                onClick={() => handlePageChange(displayResult.page + 1)}
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
