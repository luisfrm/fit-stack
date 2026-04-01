"use client";

import * as React from "react";
import { Table, ColumnDef, Badge, Button, Text } from "@workspace/ui/components";
import { Role } from "@/lib/services/rbac-service";
import { Edit2 } from "lucide-react";

interface RolesTableProps {
  readonly roles: Role[];
  readonly onEdit: (role: Role) => void;
  readonly loading?: boolean;
}

/**
 * 💡 Nota Arquitectónica: Las columnas se definen fuera del componente principal
 * para cumplir con la regla SonarQube S6478 y evitar problemas de performance
 * o pérdida de estado durante los ciclos de renderizado de React.
 */
const getColumns = (onEdit: (role: Role) => void): ColumnDef<Role>[] => [
  {
    header: "Rol",
    cell: (r) => (
      <div className="flex flex-col">
        <Text weight="bold" uppercase className="tracking-tight italic">{r.name}</Text>
        <Text size="xs" variant="muted">{r.description}</Text>
      </div>
    ),
  },
  {
    header: "Permisos",
    cell: (r) => (
      <div className="flex flex-wrap gap-2 max-w-md">
        {r.rolePermissions?.map(rp => (
          <Badge key={rp.permissionId} variant="outline" size="sm" className="text-[10px] uppercase font-bold py-0.5">
            {rp.permission?.name}
          </Badge>
        ))}
        {(!r.rolePermissions || r.rolePermissions.length === 0) && (
          <Text size="xs" italic variant="muted" className="opacity-50">Sin permisos</Text>
        )}
      </div>
    ),
  },
  {
    header: "Acciones",
    className: "text-right",
    cell: (r) => (
      <div className="flex items-center justify-end gap-2">
        <Button
          size="sm"
          variant="ghost"
          onClick={() => onEdit(r)}
          title="Editar Rol"
          className="hover:bg-white/10"
        >
          <Edit2 size={16} />
        </Button>
      </div>
    ),
  },
];

export function RolesTable({ roles, onEdit, loading }: RolesTableProps) {
  // Optimizamos las columnas mediante useMemo
  const columns = React.useMemo(() => getColumns(onEdit), [onEdit]);

  return (
    <div className="grid gap-6">
      <Table
        data={roles}
        columns={columns}
        loading={loading}
      />
    </div>
  );
}
