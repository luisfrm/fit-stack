"use client";

import * as React from "react";
import { Table, type ColumnDef, Badge, Button, Text } from "@workspace/ui/components";
import { type ISubscription } from "@/types/dashboard";
import { Ban, Trash2, CheckCircle2 } from "lucide-react";

const getStatusBadge = (status: string) => {
  switch(status) {
    case "active": return <Badge className="bg-emerald-500/10 text-emerald-500 border-none">Activa</Badge>;
    case "canceled": return <Badge className="bg-red-500/10 text-red-500 border-none">Cancelada</Badge>;
    case "expired": return <Badge className="bg-slate-500/10 text-slate-400 border-none">Expirada</Badge>;
    default: return <Badge variant="outline">{status}</Badge>;
  }
};

const getColumns = (
  onStatusChange: (id: number, status: 'active'|'canceled'|'expired') => void,
  onDelete: (id: number) => void
): ColumnDef<ISubscription>[] => [
  {
    header: "Miembro",
    className: "pl-6",
    headerClassName: "pl-6",
    cell: (sub) => (
      <Text as="span" weight="bold" className="text-white hover:text-primary transition-colors cursor-pointer">
        {sub.memberName || `User #${sub.memberId}`}
      </Text>
    )
  },
  {
    header: "Plan",
    cell: (sub) => (
      <div className="flex flex-col">
        <Text as="span" size="sm" className="uppercase font-bold tracking-widest text-primary">
          {sub.planName}
        </Text>
        {sub.price !== undefined && (
          <Text as="span" size="xs" variant="muted">
            ${sub.price/100}/mes
          </Text>
        )}
      </div>
    )
  },
  {
    header: "Alta",
    cell: (sub) => (
      <Text as="span" size="sm" variant="muted">
        {new Date(sub.startDate).toLocaleDateString("es-ES", { day: '2-digit', month: 'short', year: 'numeric' })}
      </Text>
    )
  },
  {
    header: "Vencimiento",
    cell: (sub) => (
      <Text as="span" size="sm" className={
        new Date(sub.endDate) < new Date() && sub.status === "active" 
          ? "text-red-400 font-bold" 
          : "text-slate-400"
      }>
        {new Date(sub.endDate).toLocaleDateString("es-ES", { day: '2-digit', month: 'short', year: 'numeric' })}
      </Text>
    )
  },
  {
    header: "Estado",
    cell: (sub) => getStatusBadge(sub.status)
  },
  {
    header: "Acciones",
    className: "pr-6 text-right",
    headerClassName: "pr-6 text-right",
    cell: (sub) => (
      <div className="flex items-center justify-end gap-2">
        {sub.status === "active" ? (
          <Button 
            variant="ghost" 
            size="sm" 
            title="Cancelar Suscripción"
            className="h-8 px-2 text-slate-400 hover:text-yellow-500 hover:bg-yellow-500/10"
            onClick={() => sub.id && onStatusChange(sub.id, "canceled")}
          >
            <Ban size={16} className="mr-2" /> Revocar
          </Button>
        ) : (
          <Button 
            variant="ghost" 
            size="sm" 
            title="Activar Suscripción"
            className="h-8 px-2 text-slate-400 hover:text-emerald-500 hover:bg-emerald-500/10"
            onClick={() => sub.id && onStatusChange(sub.id, "active")}
          >
            <CheckCircle2 size={16} className="mr-2" /> Activar
          </Button>
        )}
        <Button 
          variant="ghost" 
          size="icon" 
          title="Eliminar Registro"
          className="h-8 w-8 text-slate-500 hover:text-red-500 hover:bg-red-500/10"
          onClick={() => {
            if (globalThis.confirm(`¿Seguro que deseas eliminar este registro de pago de ${sub.memberName}?`)) {
              sub.id && onDelete(sub.id);
            }
          }}
        >
          <Trash2 size={16} />
        </Button>
      </div>
    )
  }
];

interface SubscriptionsTableProps {
  readonly subscriptions: ISubscription[];
  readonly onDelete: (id: number) => void;
  readonly onStatusChange: (id: number, status: 'active'|'canceled'|'expired') => void;
}

export function SubscriptionsTable({ subscriptions, onDelete, onStatusChange }: SubscriptionsTableProps) {
  const columns = React.useMemo(() => getColumns(onStatusChange, onDelete), [onStatusChange, onDelete]);

  if (subscriptions.length === 0) {
    return (
      <div className="py-20 text-center flex flex-col items-center justify-center">
        <Text variant="muted">No hay cobros registrados. Genera una nueva suscripción.</Text>
      </div>
    );
  }

  return <Table columns={columns} data={subscriptions} />;
}
