"use client";

import * as React from "react";
import { Plus } from "lucide-react";
import { Button, toast } from "@workspace/ui/components";
import { subscriptionsService } from "@/lib/services/subscriptions-service";
import { type ISubscription } from "@/types/dashboard";
import { SubscriptionsTable } from "@/components/payments/subscriptions-table";
import { SubscriptionModal } from "@/components/payments/subscription-modal";
import { DashboardHeader } from "@/components/dashboard/dashboard-header";
import { FilterPanel } from "@/components/dashboard/filter-panel";
import { useDebounce } from "@/lib/hooks/use-debounce";
import { ORG_ROLES } from "@workspace/shared";

export default function PaymentsPage() {
  const [subs, setSubs] = React.useState<ISubscription[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [search, setSearch] = React.useState("");
  const [searchTerm, setSearchTerm] = React.useState("");
  const debouncedSearch = useDebounce(searchTerm, 500);

  const loadSubs = async () => {
    try {
      setLoading(true);
      const data = await subscriptionsService.getAll();
      setSubs(data);
    } catch (err: any) {
      toast.error(err.message || "Error al cargar suscripciones");
    } finally {
      setLoading(false);
    }
  };

  React.useEffect(() => {
    loadSubs();
  }, []);

  // Sync debounced search
  React.useEffect(() => {
    setSearch(debouncedSearch);
  }, [debouncedSearch]);

  const handleStatusChange = async (id: number, status: 'active' | 'canceled' | 'expired') => {
    try {
      await subscriptionsService.updateStatus(id, status);
      toast.success(`Suscripción ${status === 'active' ? 'activada' : 'revocada'}.`);
      loadSubs();
    } catch (err: any) {
      toast.error(err.message || "Fallo al cambiar estado");
    }
  };

  const handleDelete = async (id: number) => {
    try {
      await subscriptionsService.delete(id);
      toast.success("Registro eliminado.");
      loadSubs();
    } catch (err: any) {
      toast.error(err.message || "Fallo al eliminar");
    }
  };

  const filteredSubs = subs.filter(s => {
    const matches = s.memberName?.toLowerCase().includes(search.toLowerCase()) ||
      s.planName?.toLowerCase().includes(search.toLowerCase());

    // If searching, restrict results to Cliente role
    if (search.trim() !== "") {
      return matches && s.role === ORG_ROLES.MEMBER;
    }
    return matches;
  });

  return (
    <div className="flex flex-col gap-6">
      <DashboardHeader
        title="Suscripciones y Pagos"
        description="Controla las facturas, renovaciones y vinculaciones de usuarios a sus planes."
        iconName="CreditCard"
      >
        <SubscriptionModal
          onSuccess={() => loadSubs()}
          trigger={
            <Button size="sm" rightIcon={<Plus size={18} />}>
              NUEVO PAGO
            </Button>
          }
        />
      </DashboardHeader>

      <FilterPanel
        searchValue={searchTerm}
        onSearchChange={setSearchTerm}
        searchPlaceholder="Buscar por usuario o nivel de plan..."
      />

      <section>
        <SubscriptionsTable
          subscriptions={filteredSubs}
          onDelete={handleDelete}
          onStatusChange={handleStatusChange}
          loading={loading}
        />
      </section>
    </div>
  );
}
