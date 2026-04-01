"use client";

import * as React from "react";
import { Plus, CreditCard, Search } from "lucide-react";
import { Button, Input, toast } from "@workspace/ui/components";
import { type ISubscription } from "@/types/dashboard";
import { subscriptionsService } from "@/lib/services/subscriptions-service";
import { SubscriptionsTable } from "@/components/payments/subscriptions-table";
import { SubscriptionModal } from "@/components/payments/subscription-modal";

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

  const filteredSubs = subs.filter(s =>
    s.memberName?.toLowerCase().includes(search.toLowerCase()) ||
    s.planName?.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-white flex items-center gap-3 uppercase">
            <CreditCard className="text-primary w-8 h-8" />
            Suscripciones y Pagos
          </h1>
          <p className="text-slate-400 mt-2 text-sm">
            Controla las facturas, renovaciones y vinculaciones de usuarios a sus planes.
          </p>
        </div>

        <SubscriptionModal
          onSuccess={() => loadSubs()}
          trigger={
            <Button size="lg" className="rounded-xl w-full md:w-auto font-bold tracking-wider" rightIcon={<Plus size={18} />}>
              NUEVO PAGO
            </Button>
          }
        />
      </header>

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
