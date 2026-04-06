"use client";

import * as React from "react";
import { Building2, Edit2 } from "lucide-react";
import { 
  Table, 
  ColumnDef, 
  Badge, 
  Avatar, 
  AvatarFallback, 
  Button 
} from "@workspace/ui/components";
import { OrganizationActions } from "./organization-actions";
import { OrganizationModal } from "./organization-modal";
import { type Organization } from "./organization-mobile-card";

interface OrganizationsTableProps {
  readonly organizations: Organization[];
  readonly isLoading?: boolean;
  readonly onSuccess?: () => void;
}

const getColumns = (onSuccess: () => void): ColumnDef<Organization>[] => [
  {
    header: "Organización",
    className: "pl-6",
    headerClassName: "pl-6",
    cell: (org) => (
      <div className="flex items-center gap-3">
        <Avatar size="default" className="size-9 border border-white/10 bg-primary/10">
          <AvatarFallback className="bg-transparent text-primary">
            <Building2 size={18} />
          </AvatarFallback>
        </Avatar>
        <div className="flex flex-col min-w-0">
          <span className="font-semibold text-white truncate max-w-[200px]">
            {org.name}
          </span>
          <span className="text-[10px] text-gray-400 truncate max-w-[200px] tracking-wider font-medium">
            {org.domain}
          </span>
        </div>
      </div>
    )
  },
  {
    header: "Miembros",
    cell: (org) => (
      <div className="flex flex-col">
        <span className="text-sm font-bold text-gray-200">{org.memberCount}</span>
        <span className="text-[10px] text-gray-500 uppercase font-bold tracking-tighter">Total Activos</span>
      </div>
    )
  },
  {
    header: "Estado",
    cell: (org) => {
      const variants: Record<Organization['status'], "default" | "secondary" | "destructive" | "outline"> = {
        active: "default",
        pending: "outline",
        inactive: "destructive"
      };
      
      const labels: Record<Organization['status'], string> = {
        active: "Activo",
        pending: "Pendiente",
        inactive: "Inactivo"
      };

      return (
        <Badge variant={variants[org.status] || "secondary"}>
          {labels[org.status] || org.status}
        </Badge>
      );
    }
  },
  {
    header: "Acciones",
    className: "pr-6 text-right",
    headerClassName: "pr-6 text-right",
    cell: (org) => (
      <div className="flex items-center justify-end gap-1">
        <OrganizationModal
          organization={org}
          onSuccess={onSuccess}
          trigger={
            <Button variant="ghost" size="icon" title="Editar">
              <Edit2 size={16} className="text-gray-400" />
            </Button>
          }
        />
        <OrganizationActions 
          status={org.status} 
          onActivate={() => console.log('Activar', org.id)}
        />
      </div>
    )
  }
];

export function OrganizationsTable({ organizations, isLoading, onSuccess }: OrganizationsTableProps) {
  const columns = React.useMemo(() => getColumns(onSuccess ?? (() => {})), [onSuccess]);

  return (
    <Table
      columns={columns}
      data={organizations}
      loading={isLoading}
    />
  );
}
