"use client";

import * as React from "react";
import {
  Input,
  Button,
  toast,
} from "@workspace/ui/components";
import { Plus, Search, ChevronLeft, ChevronRight } from "lucide-react";
import { type IMember } from "@/types/dashboard";
import { MembersTable } from "@/components/members/members-table";
import { MemberModal } from "@/components/members/member-modal";
import { membersService } from "@/lib/services/members-service";
import { DashboardHeader } from "@/components/dashboard/dashboard-header";
import { ROLES } from "@workspace/shared/constants";

export default function MembersPage() {
  const [members, setMembers] = React.useState<IMember[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  // Filtros
  const [query, setQuery] = React.useState("");
  const role = ROLES.MEMBER; // Fuerza el rol de cliente
  const [tempQuery, setTempQuery] = React.useState("");

  // Paginación
  const [page, setPage] = React.useState(1);
  const [totalPages, setTotalPages] = React.useState(1);
  const limit = 10;

  const loadMembers = React.useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      const filters: any = { page, limit, role };
      if (query) filters.query = query;

      const data = await membersService.getMembers(filters);
      setMembers(data.data);
      setTotalPages(data.totalPages || 1);
    } catch (err: any) {
      setError(err.message || "Error al cargar clientes");
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
      toast.success("Cliente eliminado.");
      if (members.length === 1 && page > 1) {
        setPage((prev) => prev - 1);
      } else {
        loadMembers();
      }
    } catch (err: any) {
      toast.error(err.message || "Fallo al eliminar cliente");
    }
  };

  const handleSearchSubmit = (e: React.SubmitEvent) => {
    e.preventDefault();
    setQuery(tempQuery);
    setPage(1);
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
          onSuccess={() => loadMembers()}
        />
      </DashboardHeader>

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
