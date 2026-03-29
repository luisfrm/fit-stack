"use client";

import * as React from "react";
import { CalendarDays, Plus, Filter, Search, Loader2 } from "lucide-react";
import { Button, Text, toast } from "@workspace/ui/components";
import { ClassesTable } from "@/components/classes/classes-table";
import { ClassModal } from "@/components/classes/class-modal";
import { type ICmsClass } from "@/types/dashboard";
import { classesService } from "@/lib/services/classes-service";

export default function ClassesPage() {
  const [classes, setClasses] = React.useState<ICmsClass[]>([]);
  const [isLoading, setIsLoading] = React.useState(true);
  const [searchQuery, setSearchQuery] = React.useState("");

  const fetchClasses = React.useCallback(async () => {
    setIsLoading(true);
    try {
      const data = await classesService.getClasses();
      setClasses(data);
    } catch (error: any) {
      const message = error.response?.data?.error ?? error.message ?? "No se pudo conectar con el servidor";
      toast.error(message);
    } finally {
      setIsLoading(false);
    }
  }, []);

  React.useEffect(() => {
    fetchClasses();
  }, [fetchClasses]);

  const filteredClasses = classes.filter(cls =>
    cls.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    cls.trainerName?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const handleDelete = async (id: number) => {
    if (!confirm("¿Estás seguro de que deseas eliminar esta clase?")) return;

    try {
      await classesService.deleteClass(id);
      toast.success("Clase eliminada correctamente");
      fetchClasses();
    } catch (error: any) {
      const message = error.response?.data?.error ?? error.message ?? "Error al eliminar la clase";
      toast.error(message);
    }
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
            onSuccess={fetchClasses}
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
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-white/5 border border-white/10 rounded-lg py-2 pl-10 pr-4 text-sm text-slate-200 outline-none focus:ring-1 focus:ring-primary placeholder:text-slate-600 transition-all"
          />
        </div>
        <div className="flex gap-2">
          <Button variant="glass" size="sm" leftIcon={<Filter className="w-4 h-4" />}>
            Filtrar
          </Button>
          <Button variant="glass" size="sm">
            PDF
          </Button>
        </div>
      </div>

      {/* ── Classes List ── */}
      <section className="animate-in fade-in slide-in-from-bottom-3 duration-500">
        <div className="flex items-center gap-2 mb-4 text-slate-400">
          <CalendarDays size={18} />
          <Text size="sm" weight="bold" className="uppercase tracking-widest">Listado de Clases</Text>
        </div>

        {isLoading ? (
          <div className="flex flex-col items-center justify-center py-20 gap-3 text-slate-500">
            <Loader2 className="w-8 h-8 animate-spin text-primary" />
            <Text>Cargando clases...</Text>
          </div>
        ) : (
          <ClassesTable
            classes={filteredClasses}
            onDelete={handleDelete}
            onUpdate={fetchClasses}
          />
        )}
      </section>
    </>
  );
}
