"use client";

import * as React from "react";
import {
  Table,
  ColumnDef,
  Text,
  Badge,
  Button,
  NextImage
} from "@workspace/ui/components";
import { ExternalLink, Edit2, CreditCard, Building2 } from "lucide-react";
import { type IPlatformOrganization } from "@workspace/shared/types";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { uploadService } from "@/lib/services/upload-service";

import { useRouter } from "next/navigation";

interface OrganizationTableProps {
  readonly organizations: IPlatformOrganization[];
  readonly loading: boolean;
  readonly onEdit: (org: IPlatformOrganization) => void;
  readonly onAddSubscription: (org: IPlatformOrganization) => void;
}

const getColumns = (
  onEdit: (org: IPlatformOrganization) => void,
  onAddSubscription: (org: IPlatformOrganization) => void,
  router: any
): ColumnDef<IPlatformOrganization>[] => [
  {
    header: "Organización",
    className: "pl-6 w-[300px]",
    headerClassName: "pl-6",
    cell: (org) => (
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-lg bg-primary/10 border border-primary/20 flex items-center justify-center text-primary shrink-0 overflow-hidden">
          {org.logo ? (
            <NextImage src={uploadService.getMediaUrl(org.logo)} alt={org.name} width={40} height={40} className="w-full h-full object-cover" />
          ) : (
            <Building2 size={20} />
          )}
        </div>
        <div className="flex flex-col min-w-0">
          <Text size="sm" weight="bold" className="text-white truncate uppercase tracking-tight font-display italic leading-tight">
            {org.name}
          </Text>
          <Text size="xs" variant="muted" className="truncate opacity-60">
            {org.slug}.fit-stack.com
          </Text>
        </div>
      </div>
    )
  },
  {
    header: "Suscripción Actual",
    cell: (org) => {
      const sub = org.latestSubscription;
      if (!sub) {
        return (
          <div className="flex flex-col gap-0.5">
            <Text size="xs" weight="bold" className="text-slate-600 uppercase tracking-widest italic">Sin Suscripción</Text>
            <Text size="xs" variant="muted">No se han detectado planes activos.</Text>
          </div>
        );
      }

      return (
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-2">
            <Badge variant={sub.status === 'active' ? 'success' : 'warning'} className="uppercase text-[9px] font-black tracking-tighter h-5">
              {sub.planName || 'Plan Personalizado'}
            </Badge>
            {sub.isTrial && (
              <Badge variant="info" className="uppercase text-[9px] font-black tracking-tighter h-5">
                Prueba
              </Badge>
            )}
          </div>
          <Text size="xs" className="text-slate-500 font-medium">
            Expira: <span className="text-slate-300 font-bold">
              {format(new Date(sub.endDate), "dd MMM yyyy", { locale: es })}
            </span>
          </Text>
        </div>
      );
    }
  },
  {
    header: "Acciones",
    className: "pr-6 text-right",
    headerClassName: "pr-6 text-right",
    cell: (org) => (
      <div className="flex items-center justify-end gap-2">
        <Button
          variant="outlined"
          size="sm"
          onClick={() => onAddSubscription(org)}
          className="bg-transparent border-white/10 hover:bg-white/10 h-9 text-[10px] font-black uppercase tracking-widest px-3"
        >
          <CreditCard size={14} className="mr-2" />
          Plan
        </Button>
        <Button
          variant="outlined"
          size="sm"
          onClick={() => onEdit(org)}
          className="bg-transparent border-white/10 hover:bg-white/10 h-9 text-[10px] font-black uppercase tracking-widest px-3"
        >
          <Edit2 size={14} className="mr-2" />
          Editar
        </Button>
        <Button
          variant="primary"
          size="sm"
          onClick={() => router.push(`/dashboard/platform/organizations/${org.id}`)}
          className="h-9 w-9 p-0 flex items-center justify-center shrink-0"
        >
          <ExternalLink size={16} />
        </Button>
      </div>
    )
  }
];

export function OrganizationTable({
  organizations,
  loading,
  onEdit,
  onAddSubscription
}: OrganizationTableProps) {
  const router = useRouter();
  const columns = React.useMemo(() => getColumns(onEdit, onAddSubscription, router), [onEdit, onAddSubscription, router]);

  return (
    <Table
      columns={columns}
      data={organizations}
      loading={loading}
    />
  );
}
