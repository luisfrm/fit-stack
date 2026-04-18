"use client";

import * as React from "react";
import { Plus } from "lucide-react";
import { Button, toast } from "@workspace/ui/components";
import { SubscriptionsTable } from "@/components/payments/subscriptions-table";
import { SubscriptionModal } from "@/components/payments/subscription-modal";
import { DashboardHeader } from "@/components/dashboard/dashboard-header";
import { FilterPanel } from "@/components/dashboard/filter-panel";
import { useDebounce } from "@/lib/hooks/use-debounce";
import { ORG_ROLES } from "@workspace/shared";

import {
  useSubscriptions,
  useUpdateSubscriptionStatus,
  useDeleteSubscription,
  useUpdatePaymentStatus
} from "@/lib/hooks/use-payments";

export default function PaymentsPage() {
  const { data: subs = [], isLoading, refetch } = useSubscriptions();
  const updateStatusMutation = useUpdateSubscriptionStatus();
  const deleteMutation = useDeleteSubscription();

  const [search, setSearch] = React.useState("");
  const [searchTerm, setSearchTerm] = React.useState("");
  const debouncedSearch = useDebounce(searchTerm, 500);

  // Sync debounced search
  React.useEffect(() => {
    setSearch(debouncedSearch);
  }, [debouncedSearch]);

  const handleStatusChange = async (id: number, status: 'active' | 'canceled' | 'expired') => {
    updateStatusMutation.mutate({ id, status }, {
      onSuccess: () => {
        toast.success(`Suscripción ${status === 'active' ? 'activada' : 'revocada'}.`);
      },
      onError: (err: any) => {
        toast.error(err.message || "Fallo al cambiar estado");
      }
    });
  };

  const handleDelete = async (id: number) => {
    deleteMutation.mutate(id, {
      onSuccess: () => {
        toast.success("Registro eliminado.");
      },
      onError: (err: any) => {
        toast.error(err.message || "Fallo al eliminar");
      }
    });
  };

  const updatePaymentStatusMutation = useUpdatePaymentStatus();

  const handlePaymentStatusChange = async (paymentId: number, status: string) => {
    updatePaymentStatusMutation.mutate({ paymentId, status }, {
      onSuccess: () => {
        toast.success("Estado de pago actualizado correctamente");
      },
      onError: (err: any) => {
        toast.error(err.message || "Error al actualizar pago");
      }
    });
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
          onSuccess={() => refetch()}
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
          onPaymentStatusChange={handlePaymentStatusChange}
          loading={isLoading}
        />
      </section>
    </div>
  );
}
