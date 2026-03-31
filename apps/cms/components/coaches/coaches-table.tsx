"use client";

import * as React from "react";
import { type ICoach } from "@/types/dashboard";
import { NoData } from "../dashboard/dashboard-ui";
import { getMediaUrl } from "@/lib/utils/media-utils";
import { Avatar, AvatarFallback, AvatarImage } from "@workspace/ui/components/avatar";
import { Text } from "@workspace/ui/components/text";
import { Table, type ColumnDef } from "@workspace/ui/components";
import { Button } from "@workspace/ui/components/button";
import { Pencil, Trash2 } from "lucide-react";

interface CoachesTableProps {
  readonly coaches: ICoach[];
  readonly onEdit: (coach: ICoach) => void;
  readonly onDelete: (coach: ICoach) => void;
  readonly loading?: boolean;
}

const getColumns = (
  onEdit: (coach: ICoach) => void,
  onDelete: (coach: ICoach) => void
): ColumnDef<ICoach>[] => [
  {
    header: "Entrenador",
    className: "pl-6",
    headerClassName: "pl-6",
    cell: (coach) => (
      <div className="flex items-center gap-3">
        <Avatar size="default">
          {coach.imageUrl && <AvatarImage src={getMediaUrl(coach.imageUrl)} alt={coach.name} />}
          <AvatarFallback>{coach.name.charAt(0)}</AvatarFallback>
        </Avatar>
        <div className="flex flex-col min-w-0">
          <Text as="span" size="base" weight="medium" truncate>
            {coach.name}
          </Text>
          <Text as="span" size="xs" variant="subtle" truncate>
            {coach.role}
          </Text>
        </div>
      </div>
    )
  },
  {
    header: "Especialidades",
    cell: (coach) => (
      <Text as="span" size="sm" variant="muted">
        {coach.specialities && coach.specialities.length > 0 
          ? coach.specialities.join(", ") 
          : "Ninguna"}
      </Text>
    )
  },
  {
    header: "Estado",
    cell: (coach) => (
      coach.isVisible ? (
        <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold bg-emerald-500/20 text-emerald-400">
          Visible
        </span>
      ) : (
        <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold bg-slate-500/20 text-slate-400">
          Oculto
        </span>
      )
    )
  },
  {
    header: "Acciones",
    className: "pr-6 text-right flex justify-end",
    headerClassName: "pr-6 text-right",
    cell: (coach) => (
      <div className="flex items-center justify-end gap-2">
         <Button variant="ghost" size="icon" onClick={() => onEdit(coach)}>
          <Pencil size={18} className="text-slate-400" />
        </Button>
        <Button variant="ghost" size="icon" onClick={() => onDelete(coach)} className="hover:text-red-500 hover:bg-red-500/10 transition-colors">
          <Trash2 size={18} className="text-slate-400 hover:text-red-400 transition-colors" />
        </Button>
      </div>
    )
  }
];

export function CoachesTable({ coaches, onEdit, onDelete, loading }: CoachesTableProps) {
  const columns = React.useMemo(() => getColumns(onEdit, onDelete), [onEdit, onDelete]);

  return (
    <Table 
      columns={columns} 
      data={coaches} 
      loading={loading}
      emptyState={<NoData message="No hay entrenadores registrados. Intenta ajustando los filtros o añade uno nuevo." className="py-20" />}
    />
  );
}
