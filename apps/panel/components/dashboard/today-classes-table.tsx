"use client";

import { type ColumnDef, Table, Text } from "@workspace/ui/components";

import { type IClassToday } from "@/types/dashboard";
import { formatTimeRange } from "@/lib/config/display";
import { NoData } from "./no-data";

const TODAY_CLASSES_COLUMNS: ColumnDef<IClassToday>[] = [
  {
    header: "Hora",
    className: "pl-6",
    headerClassName: "pl-6",
    cell: (cls) => (
      <Text as="span" size="base" variant="muted">
        {formatTimeRange(cls.startTime, cls.endTime)}
      </Text>
    )
  },
  {
    header: "Clase",
    cell: (cls) => <Text as="span" size="base" weight="medium">{cls.name}</Text>
  },
  {
    header: "Entrenador",
    cell: (cls) => <Text as="span" size="base" variant="muted">{cls.trainerName ?? 'Sin asignar'}</Text>
  },
  {
    header: "Cupos",
    cell: (cls) => (
      <Text as="span" size="base" variant="muted">
        {cls.capacity ? `${cls.capacity} cupos` : '—'}
      </Text>
    )
  }
];

export function TodayClassesTable({ classes, loading }: Readonly<{ classes: IClassToday[]; loading?: boolean }>) {
  return (
    <Table
      columns={TODAY_CLASSES_COLUMNS}
      data={classes}
      loading={loading}
      emptyState={<NoData message="No hay clases programadas para hoy." className="py-20" />}
      className="rounded-none"
    />
  );
}