"use client";

import * as React from "react";
import { Plus, Search, ShieldCheck, ChevronLeft, ChevronRight } from "lucide-react";
import {
  Input,
  Button,
  toast,
  ToggleGroup,
  ToggleGroupItem,
} from "@workspace/ui/components";
import { NoData } from "@/components/dashboard/dashboard-ui";
import { type IMember, type Role } from "@/types/dashboard";
import { MembersTable } from "@/components/members/members-table";
import { MemberModal } from "@/components/members/member-modal";
import { membersService } from "@/lib/services/members-service";

export default function MembersPage() {
  const [members, setMembers] = React.useState<IMember[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  // Filtros
  const [query, setQuery] = React.useState("");
  const [role, setRole] = React.useState<Role | "all">("all");
  const [tempQuery, setTempQuery] = React.useState("");

  // Paginación
  const [page, setPage] = React.useState(1);
  const [totalPages, setTotalPages] = React.useState(1);
  const limit = 10;

  const loadMembers = React.useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      const filters: any = { page, limit };
      if (query) filters.query = query;
      if (role && role !== "all") filters.role = role;

      const data = await membersService.getMembers(filters);
      setMembers(data.data);
      setTotalPages(data.totalPages || 1);
    } catch (err: any) {
      setError(err.message || "Error al cargar miembros");
    } finally {
      setLoading(false);
    }
  }, [page, limit, query, role]);

  React.useEffect(() => {
    loadMembers();
  }, [loadMembers]);

  const handleDelete = async (id: number) => {
    try {
      await membersService.deleteMember(id);
      toast.success("Miembro eliminado.");
      if (members.length === 1 && page > 1) {
        setPage((prev) => prev - 1);
      } else {
        loadMembers();
      }
    } catch (err: any) {
      toast.error(err.message || "Fallo al eliminar miembro");
    }
  };

  const handleSearchSubmit = (e: React.SubmitEvent) => {
    e.preventDefault();
    setQuery(tempQuery);
    setPage(1);
  };

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-white flex items-center gap-2">
            <ShieldCheck size={24} className="text-primary" /> Miembros
          </h1>
          <p className="text-sm text-gray-400 mt-1">
            Administra los usuarios registrados en tu plataforma, asignado roles y accesos.
          </p>
        </div>

        <MemberModal
          trigger={
            <Button variant="primary" size="sm" leftIcon={<Plus size={18} />}>
              NUEVO MIEMBRO
            </Button>
          }
          onSuccess={() => loadMembers()}
        />
      </header>

      {/* Panel de Filtros */}
      <section className="bg-white/5 border border-white/5 p-4 rounded-2xl flex flex-col md:flex-row gap-4 items-center justify-between">
        <form onSubmit={handleSearchSubmit} className="flex gap-2 w-full md:w-[350px]">
          <Input
            value={tempQuery}
            onChange={(e) => setTempQuery(e.target.value)}
            placeholder="Buscar por nombre, email..."
            leftIcon={<Search size={16} />}
          />
          <Button type="submit" variant="outlined" className="h-[46px]">Buscar</Button>
        </form>

        <ToggleGroup
          type="single"
          value={role}
          onValueChange={(val) => {
            if (val) {
              setRole(val as Role | "all");
              setPage(1);
            }
          }}
          className="bg-black/30 w-full md:w-auto overflow-x-auto p-1 rounded-xl border border-white/5"
        >
          <ToggleGroupItem value="all" className="rounded-lg data-[state=on]:bg-white/10 text-xs px-3 py-1.5 h-auto">Todos</ToggleGroupItem>
          <ToggleGroupItem value="client" className="rounded-lg data-[state=on]:bg-white/10 text-xs px-3 py-1.5 h-auto">Clientes</ToggleGroupItem>
          <ToggleGroupItem value="trainer" className="rounded-lg data-[state=on]:bg-white/10 text-xs px-3 py-1.5 h-auto">Entrenadores</ToggleGroupItem>
          <ToggleGroupItem value="manager" className="rounded-lg data-[state=on]:bg-white/10 text-xs px-3 py-1.5 h-auto">Managers</ToggleGroupItem>
          <ToggleGroupItem value="admin" className="rounded-lg data-[state=on]:bg-white/10 text-xs px-3 py-1.5 h-auto">Admins</ToggleGroupItem>
        </ToggleGroup>
      </section>

      {/* Tabla */}
      <section>
        {error ? (
          <div className="flex items-center justify-center p-12 text-red-400 bg-red-500/10 rounded-xl">
            {error}
          </div>
        ) : (
          <div className="space-y-6">
            <MembersTable
              members={members}
              onDelete={handleDelete}
              onSuccess={() => loadMembers()}
              loading={loading}
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
