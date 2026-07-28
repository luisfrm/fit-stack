"use client";

import * as React from "react";
import { CalendarDays, Plus, Filter, ChevronLeft, ChevronRight } from "lucide-react";
import { Button, Text } from "@workspace/ui/components";
import { useRouter } from "next/navigation";
import { ClassesTable } from "@/components/classes/classes-table";
import { ClassModal } from "@/components/classes/class-modal";
import { classesService } from "@/lib/services/classes-service";
import { DashboardHeader } from "@/components/dashboard/dashboard-header";
import { useDebounce } from "@/lib/hooks/use-debounce";
import { toast } from "@workspace/ui/components";

interface ClassesClientProps {
  readonly initialClasses: {
    data: Parameters<typeof ClassesTable>[0]["classes"];
    page: number;
    total: number;
    totalPages: number;
  };
  readonly initialQuery: string;
  readonly initialVisibility: "all" | "visible" | "hidden";
  readonly limit: number;
}

type VisibilityFilter = "all" | "visible" | "hidden";

export function ClassesClient({
  initialClasses,
  initialQuery,
  initialVisibility,
  limit,
}: ClassesClientProps) {
  const router = useRouter();
  const [searchInput, setSearchInput] = React.useState(initialQuery);
  const debouncedSearch = useDebounce(searchInput, 500);
  const [visibility, setVisibility] = React.useState<VisibilityFilter>(initialVisibility);
  const [deletingId, setDeletingId] = React.useState<number | null>(null);

  React.useEffect(() => {
    if (debouncedSearch === initialQuery) return;
    const params = new URLSearchParams();
    if (debouncedSearch) params.set("query", debouncedSearch);
    params.set("page", "1");
    if (visibility === "visible") params.set("isVisible", "true");
    if (visibility === "hidden") params.set("isVisible", "false");
    router.push(`/dashboard/classes?${params.toString()}`);
  }, [debouncedSearch, initialQuery, router, visibility]);

  const setVisibilityAndNavigate = (next: VisibilityFilter) => {
    setVisibility(next);
    const params = new URLSearchParams();
    if (initialQuery) params.set("query", initialQuery);
    params.set("page", "1");
    if (next === "visible") params.set("isVisible", "true");
    if (next === "hidden") params.set("isVisible", "false");
    router.push(`/dashboard/classes?${params.toString()}`);
  };

  const navigatePage = (newPage: number) => {
    const params = new URLSearchParams();
    if (initialQuery) params.set("query", initialQuery);
    if (visibility === "visible") params.set("isVisible", "true");
    if (visibility === "hidden") params.set("isVisible", "false");
    params.set("page", String(newPage));
    router.push(`/dashboard/classes?${params.toString()}`);
  };

  const handleDelete = async (id: number) => {
    if (!confirm("¿Estás seguro de que deseas eliminar esta clase?")) return;
    setDeletingId(id);
    try {
      await classesService.deleteClass(id);
      toast.success("Clase eliminada correctamente");
      router.refresh();
    } catch (error) {
      const message =
        (error as { data?: { error?: string }; message?: string }).data?.error ??
        "Error al eliminar la clase";
      toast.error(message);
    } finally {
      setDeletingId(null);
    }
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
          <Filter className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 w-4 h-4" />
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
            variant={visibility === "visible" ? "primary" : "glass"}
            size="sm"
            leftIcon={<Filter className="w-4 h-4" />}
            onClick={() =>
              setVisibilityAndNavigate(visibility === "visible" ? "all" : "visible")
            }
          >
            Visibles
          </Button>
          <Button
            variant={visibility === "hidden" ? "primary" : "glass"}
            size="sm"
            onClick={() =>
              setVisibilityAndNavigate(visibility === "hidden" ? "all" : "hidden")
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
          <Text size="xs" variant="muted">
            {initialClasses.total} clase{initialClasses.total === 1 ? "" : "s"} encontrada{initialClasses.total === 1 ? "" : "s"}
          </Text>
        </div>

        <ClassesTable
          classes={initialClasses.data}
          onDelete={handleDelete}
          loading={false}
        />

        {initialClasses.totalPages > 1 && (
          <div className="flex items-center justify-between mt-6 px-1">
            <Text size="sm" variant="muted">
              Página {initialClasses.page} de {initialClasses.totalPages}
            </Text>
            <div className="flex gap-2">
              <Button
                variant="glass"
                size="sm"
                disabled={initialClasses.page <= 1}
                leftIcon={<ChevronLeft className="w-4 h-4" />}
                onClick={() => navigatePage(initialClasses.page - 1)}
              >
                Anterior
              </Button>
              <Button
                variant="glass"
                size="sm"
                disabled={initialClasses.page >= initialClasses.totalPages}
                onClick={() => navigatePage(initialClasses.page + 1)}
              >
                Siguiente <ChevronRight className="w-4 h-4 ml-1" />
              </Button>
            </div>
          </div>
        )}
      </section>

      {deletingId !== null && (
        <span className="sr-only">Eliminando clase {deletingId}</span>
      )}
      <span className="sr-only">Límite {limit}</span>
    </>
  );
}
