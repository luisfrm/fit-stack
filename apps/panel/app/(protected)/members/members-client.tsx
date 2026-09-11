"use client";

import * as React from "react";
import { Button, toast } from "@workspace/ui/components";
import { Plus, ChevronLeft, ChevronRight } from "lucide-react";
import { useRouter } from "next/navigation";
import { type IMember, type IMemberStats } from "@workspace/shared/types";
import { MembersTable } from "@/components/members/members-table";
import { MemberModal } from "@/components/members/member-modal";
import { MembersKpiSection } from "@/components/members/members-kpi-section";
import { MembersGrowthChart } from "@/components/members/members-growth-chart";
import { BirthdaysWidget } from "@/components/members/birthdays-widget";
import { SubscriptionModal } from "@/components/payments/subscription-modal";
import { membersService } from "@/lib/services/members-service";
import { DashboardHeader } from "@/components/dashboard/dashboard-header";
import { FilterPanel } from "@/components/dashboard/filter-panel";
import { useDebounce } from "@/lib/hooks/use-debounce";
import { mutationError } from "@/lib/errors";
import { useAuth } from "@/lib/hooks/use-auth";
import { cn } from "@workspace/ui/lib/utils";

interface MembersClientProps {
  readonly initialMembers: IMember[];
  readonly initialPage: number;
  readonly initialTotalPages: number;
  readonly initialQuery: string;
  /** `?active=` crudo: "true" | "false" | null (flag `isActive` del perfil). */
  readonly initialActive: string | null;
  /** `?subscription=` crudo: "active" | "none" | null (filtro nuevo). */
  readonly initialSubscription: string | null;
  readonly initialStats: IMemberStats | null;
  readonly onRefreshServer?: () => Promise<void>;
}

type ActiveFilter = "all" | "true" | "false";
type SubscriptionFilter = "all" | "active" | "none";

function buildParams(
  query: string,
  active: ActiveFilter,
  subscription: SubscriptionFilter,
  page: number,
): string {
  const params = new URLSearchParams();
  if (query) params.set("query", query);
  if (active !== "all") params.set("active", active);
  if (subscription !== "all") params.set("subscription", subscription);
  params.set("page", String(page));
  return `/members?${params.toString()}`;
}

export function MembersClient({
  initialMembers,
  initialPage,
  initialTotalPages,
  initialQuery,
  initialActive,
  initialSubscription,
  initialStats,
  onRefreshServer,
}: MembersClientProps) {
  const router = useRouter();
  const { activeOrganization } = useAuth();
  const [members, setMembers] = React.useState<IMember[]>(initialMembers);
  const [page, setPage] = React.useState(initialPage);
  const [totalPages, setTotalPages] = React.useState(initialTotalPages);
  const [searchTerm, setSearchTerm] = React.useState(initialQuery);
  const debouncedSearch = useDebounce(searchTerm, 500);
  const [activeFilter, setActiveFilter] = React.useState<ActiveFilter>(
    initialActive === "true" || initialActive === "false" ? initialActive : "all",
  );
  const [subscriptionFilter, setSubscriptionFilter] = React.useState<SubscriptionFilter>(
    initialSubscription === "active" || initialSubscription === "none"
      ? initialSubscription
      : "all",
  );
  const [deletingId, setDeletingId] = React.useState<number | null>(null);

  const refresh = React.useCallback(async () => {
    if (onRefreshServer) {
      await onRefreshServer();
    }
    router.refresh();
  }, [router, onRefreshServer]);

  React.useEffect(() => {
    if (debouncedSearch === initialQuery) return;
    router.push(buildParams(debouncedSearch, activeFilter, subscriptionFilter, 1));
  }, [debouncedSearch, initialQuery, router, activeFilter, subscriptionFilter]);

  React.useEffect(() => {
    setMembers(initialMembers);
    setPage(initialPage);
    setTotalPages(initialTotalPages);
  }, [initialMembers, initialPage, initialTotalPages]);

  const setFilterAndNavigate = (nextActive: ActiveFilter, nextSub: SubscriptionFilter) => {
    setActiveFilter(nextActive);
    setSubscriptionFilter(nextSub);
    router.push(buildParams(searchTerm, nextActive, nextSub, 1));
  };

  const handleDelete = async (id: number) => {
    setDeletingId(id);
    try {
      await membersService.deleteMember(id);
      toast.success("Cliente eliminado.");
      if (members.length === 1 && page > 1) {
        router.push(buildParams(initialQuery, activeFilter, subscriptionFilter, page - 1));
      } else {
        refresh();
      }
    } catch (err) {
      toast.error(mutationError("MembersClient", err, "Fallo al eliminar cliente"));
    } finally {
      setDeletingId(null);
    }
  };

  const setPageAndNavigate = (newPage: number) => {
    router.push(buildParams(initialQuery, activeFilter, subscriptionFilter, newPage));
  };

  const statusOptions: Array<{ id: ActiveFilter; label: string }> = [
    { id: "all", label: "Todos" },
    { id: "true", label: "Activos" },
    { id: "false", label: "Inactivos" },
  ];
  const subscriptionOptions: Array<{ id: SubscriptionFilter; label: string }> = [
    { id: "all", label: "Todas" },
    { id: "active", label: "Con plan" },
    { id: "none", label: "Sin plan" },
  ];

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
      >
        <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
          <div data-testid="members-filter-status" className="flex items-center gap-2">
            <span className="text-xs font-medium uppercase tracking-wider text-slate-500">
              Estado
            </span>
            {statusOptions.map((opt) => (
              <Button
                key={opt.id}
                size="sm"
                variant={activeFilter === opt.id ? "primary" : "glass"}
                className={cn(
                  "members-filter-active cursor-pointer font-medium transition-all normal-case tracking-normal",
                  activeFilter !== opt.id && "text-slate-400 border-white/10 bg-white/5 hover:bg-white/10",
                )}
                onClick={() => setFilterAndNavigate(opt.id, subscriptionFilter)}
              >
                {opt.label}
              </Button>
            ))}
          </div>
          <div data-testid="members-filter-subscription" className="flex items-center gap-2">
            <span className="text-xs font-medium uppercase tracking-wider text-slate-500">
              Suscripción
            </span>
            {subscriptionOptions.map((opt) => (
              <Button
                key={opt.id}
                size="sm"
                variant={subscriptionFilter === opt.id ? "primary" : "glass"}
                className={cn(
                  "members-filter-subscription cursor-pointer font-medium transition-all normal-case tracking-normal",
                  subscriptionFilter !== opt.id && "text-slate-400 border-white/10 bg-white/5 hover:bg-white/10",
                )}
                onClick={() => setFilterAndNavigate(activeFilter, opt.id)}
              >
                {opt.label}
              </Button>
            ))}
          </div>
        </div>
      </FilterPanel>

      <MembersKpiSection stats={initialStats} />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2">
          <MembersGrowthChart
            growth={initialStats?.growth ?? []}
            timezone={activeOrganization?.timezone}
          />
        </div>
        <BirthdaysWidget birthdays={initialStats?.upcomingBirthdays ?? []} />
      </div>

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
