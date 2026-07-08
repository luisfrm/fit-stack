"use client";

import * as React from "react";
import { type ITrainer } from "@/types/dashboard";
import { NoData } from "../dashboard/dashboard-ui";
import { uploadService } from "@/lib/services/upload-service";
import { Avatar, AvatarFallback, AvatarImage } from "@workspace/ui/components/avatar";
import { Text } from "@workspace/ui/components/text";
import { Table, type ColumnDef } from "@workspace/ui/components";
import { Button } from "@workspace/ui/components/button";
import { Pencil, Trash2 } from "lucide-react";

interface TrainersTableProps {
  readonly trainers: ITrainer[];
  readonly onEdit: (trainer: ITrainer) => void;
  readonly onDelete: (trainer: ITrainer) => void;
  readonly loading?: boolean;
}

const getColumns = (
  onEdit: (trainer: ITrainer) => void,
  onDelete: (trainer: ITrainer) => void
): ColumnDef<ITrainer>[] => [
  {
    header: "Entrenador",
    className: "pl-6",
    headerClassName: "pl-6",
    cell: (trainer) => (
      <div className="flex items-center gap-3">
        <Avatar size="default">
          {trainer.imageUrl && <AvatarImage src={uploadService.getMediaUrl(trainer.imageUrl)} alt={`${trainer.firstName} ${trainer.lastName}`} />}
          <AvatarFallback>{trainer.firstName.charAt(0)}</AvatarFallback>
        </Avatar>
        <div className="flex flex-col min-w-0">
          <Text as="span" size="base" weight="medium" truncate>
            {trainer.firstName} {trainer.lastName}
          </Text>
          <Text as="span" size="xs" variant="subtle" truncate>
            {trainer.role || "Sin rol"}
          </Text>
        </div>
      </div>
    )
  },
  {
    header: "Especialidades",
    cell: (trainer) => (
      <Text as="span" size="sm" variant="muted">
        {trainer.specialities && trainer.specialities.length > 0
          ? trainer.specialities.join(", ")
          : "Ninguna"}
      </Text>
    )
  },
  {
    header: "Estado",
    cell: (trainer) => (
      trainer.isVisible ? (
        <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold bg-success/20 text-success">
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
    cell: (trainer) => (
      <div className="flex items-center justify-end gap-2">
         <Button variant="ghost" size="icon" onClick={() => onEdit(trainer)}>
          <Pencil size={18} className="text-slate-400" />
        </Button>
        <Button variant="ghost" size="icon" onClick={() => onDelete(trainer)} className="hover:text-destructive hover:bg-destructive/10 transition-colors">
          <Trash2 size={18} className="text-slate-400 hover:text-destructive transition-colors" />
        </Button>
      </div>
    )
  }
];

export function TrainersTable({ trainers, onEdit, onDelete, loading }: TrainersTableProps) {
  const columns = React.useMemo(() => getColumns(onEdit, onDelete), [onEdit, onDelete]);

  return (
    <Table
      columns={columns}
      data={trainers}
      loading={loading}
      emptyState={<NoData message="No hay entrenadores registrados. Intenta ajustando los filtros o añade uno nuevo." className="py-20" />}
    />
  );
}