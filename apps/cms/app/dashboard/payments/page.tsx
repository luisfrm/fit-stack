"use client";

import * as React from "react";
import { Plus, Search } from "lucide-react";
import { Button, toast, Input } from "@workspace/ui/components";
import { subscriptionsService } from "@/lib/services/subscriptions-service";
import { type ISubscription } from "@/types/dashboard";
import { SubscriptionsTable } from "@/components/payments/subscriptions-table";
import { SubscriptionModal } from "@/components/payments/subscription-modal";
import { DashboardHeader } from "@/components/dashboard/dashboard-header";
import { ROLES } from "@workspace/shared/constants";

export default function PaymentsPage() {
  const [subs, setSubs] = React.useState<ISubscription[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [search, setSearch] = React.useState("");

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
      return matches && s.role === ROLES.MEMBER;
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

      <section className="bg-white/5 border border-white/5 p-4 rounded-2xl flex flex-col md:flex-row gap-4 items-center justify-between">
        <div className="relative w-full md:w-96">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 w-4 h-4" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar por usuario o nivel de plan..."
            className="pl-9 h-[46px]"
          />
        </div>
      </section>

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
