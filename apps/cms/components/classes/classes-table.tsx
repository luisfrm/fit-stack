"use client";

import * as React from "react";
import { Table, ColumnDef, Badge, Button, Text } from "@workspace/ui/components";
import { type ICmsClass } from "@/types/dashboard";
import { Edit2, Trash2, Eye, EyeOff, Calendar } from "lucide-react";
import { ClassModal } from "./class-modal";
import { formatTimeRange } from "@/lib/config/display";

interface ClassesTableProps {
  readonly classes: ICmsClass[];
  readonly onDelete?: (id: number) => void;
  readonly loading?: boolean;
}

const getColumns = (
  onDelete?: (id: number) => void
): ColumnDef<ICmsClass>[] => [
  {
    header: "Clase",
    className: "pl-6",
    headerClassName: "pl-6",
    cell: (cls) => (
      <div className="flex flex-col">
        <Text weight="bold" className="text-slate-100 group-hover:text-primary transition-colors">
          {cls.name}
        </Text>
        {cls.description && (
          <Text size="xs" variant="muted" className="line-clamp-1 max-w-[200px]">
            {cls.description}
          </Text>
        )}
      </div>
    ),
  },
  {
    header: "Horario",
    cell: (cls) => (
      <Text size="sm" className="text-slate-300">
        {formatTimeRange(cls.startTime, cls.endTime)}
      </Text>
    ),
  },
  {
    header: "Entrenador",
    cell: (cls) => (
      <Text size="sm" className="text-slate-300">
        {cls.trainerName || "Sin asignar"}
      </Text>
    ),
  },
  {
    header: "Estado",
    cell: (cls) => (
      <Badge 
        variant="outline"
        className={cls.isVisible ? "bg-primary/20 text-primary border-primary/20" : "bg-slate-500/20 text-slate-400 border-slate-500/20"}
      >
        <div className="flex items-center gap-1.5 font-normal">
          {cls.isVisible ? <Eye size={12} /> : <EyeOff size={12} />}
          {cls.isVisible ? "Visible" : "Oculta"}
        </div>
      </Badge>
    ),
  },
  {
    header: "Acciones",
    className: "pr-6 text-right",
    headerClassName: "pr-6 text-right",
    cell: (cls) => (
      <div className="flex justify-end gap-2">
        <ClassModal 
          classData={cls}
          trigger={
            <Button variant="ghost" size="sm" className="h-8 w-8 p-0 hover:bg-white/10 text-slate-400 hover:text-white">
              <Edit2 size={14} />
            </Button>
          }
        />
        <Button 
          variant="ghost" 
          size="sm" 
          className="h-8 w-8 p-0 hover:bg-destructive/10 text-slate-400 hover:text-destructive"
          onClick={(e) => {
            e.stopPropagation();
            if (cls.id) onDelete?.(cls.id);
          }}
        >
          <Trash2 size={14} />
        </Button>
      </div>
    ),
  },
];

export function ClassesTable({ classes, onDelete, loading }: ClassesTableProps) {
  const columns = React.useMemo(() => getColumns(onDelete), [onDelete]);

  const emptyState = (
    <div className="flex flex-col items-center justify-center py-10 px-4 text-center">
      <div className="w-16 h-16 bg-white/5 rounded-full flex items-center justify-center mb-4">
        <Calendar className="text-white/20 w-8 h-8" />
      </div>
      <Text as="p" size="lg" weight="bold" className="text-slate-200">No hay clases registradas</Text>
      <Text variant="muted" className="max-w-xs mt-1">
        Comienza creando tu primera clase para que aparezca en la lista y en la App.
      </Text>
    </div>
  );

  return (
    <Table 
      columns={columns} 
      data={classes} 
      emptyState={emptyState}
      loading={loading}
    />
  );
}
