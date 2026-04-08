"use client";

import * as React from "react";
import {
  Table,
  ColumnDef,
  Badge,
  Button,
  NextImage,
  Text,
  Skeleton
} from "@workspace/ui/components";
import { OrganizationActions } from "./organization-actions";
import { Building2, Edit2, CreditCard, ExternalLink, Users, Settings } from "lucide-react";
import { useRouter } from "next/navigation";
import { type IPlatformOrganization } from "@workspace/shared/types";
import { uploadService } from "@/lib/services/upload-service";
import { format } from "date-fns";
import { es } from "date-fns/locale";

interface OrganizationsTableProps {
  readonly organizations: IPlatformOrganization[];
  readonly isLoading?: boolean;
  readonly onSuccess?: () => void;
  readonly onEdit?: (org: IPlatformOrganization) => void;
  readonly onAddSubscription?: (org: IPlatformOrganization) => void;
  readonly variant?: 'simple' | 'detailed';
}

const getColumns = (
  onSuccess: () => void,
  onEdit?: (org: IPlatformOrganization) => void,
  onAddSubscription?: (org: IPlatformOrganization) => void,
  variant: 'simple' | 'detailed' = 'simple',
  isLoading?: boolean,
  router?: any
): ColumnDef<IPlatformOrganization>[] => {
  const columns: ColumnDef<IPlatformOrganization>[] = [
    {
      header: "Organización",
      className: "pl-6 w-[300px]",
      headerClassName: "pl-6",
      cell: (org) => {
        if (isLoading) {
          return (
            <div className="flex items-center gap-3">
              <Skeleton className="w-10 h-10 rounded-lg shrink-0" />
              <div className="flex flex-col gap-2">
                <Skeleton className="h-4 w-32" />
                <Skeleton className="h-3 w-24" />
              </div>
            </div>
          );
        }
        return (
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-primary/10 border border-primary/20 flex items-center justify-center text-primary shrink-0 overflow-hidden shadow-lg shadow-primary/5 transition-transform hover:scale-105 duration-300">
              {org.logo ? (
                <NextImage
                  src={uploadService.getMediaUrl(org.logo)}
                  alt={org.name}
                  width={40}
                  height={40}
                  className="w-full h-full object-cover"
                />
              ) : (
                <Building2 size={20} />
              )}
            </div>
            <div className="flex flex-col min-w-0">
              <Text size="sm" weight="bold" className="text-white truncate uppercase tracking-tight font-display italic leading-tight">
                {org.name}
              </Text>
              <Text size="xs" variant="muted" className="truncate opacity-60 font-medium">
                {org.slug}.fit-stack.com
              </Text>
            </div>
          </div>
        );
      }
    },
    {
      header: "Ubicación",
      className: "w-[150px]",
      cell: (org) => {
        if (isLoading) {
          return (
            <div className="flex flex-col gap-2">
              <Skeleton className="h-4 w-20" />
              <Skeleton className="h-3 w-28" />
            </div>
          );
        }
        return (
          <div className="flex flex-col gap-0.5">
            <div className="flex items-center gap-1.5">
              <div className="w-4 h-3 bg-white/10 rounded-sm flex items-center justify-center text-[8px] font-bold text-gray-400 border border-white/5 uppercase">
                {org.countryCode || '??'}
              </div>
              <Text size="xs" weight="bold" className="text-gray-300 uppercase tracking-tighter">
                {org.countryCode === 'VE' ? 'Venezuela' : (org.countryCode || 'Global')}
              </Text>
            </div>
            <Text size="xs" variant="muted" className="opacity-50 font-mono tracking-widest text-[9px]">
              {org.taxId || 'SIN IDENTIFICADOR'}
            </Text>
          </div>
        );
      }
    },
    {
      header: "Métricas",
      className: "w-[120px]",
      cell: (org) => {
        if (isLoading) {
          return (
            <div className="flex flex-col gap-2">
              <Skeleton className="h-4 w-8" />
              <Skeleton className="h-2 w-16" />
            </div>
          );
        }
        return (
          <div className="flex flex-col">
            <div className="flex items-center gap-1.5">
              <Users size={12} className="text-primary" />
              <span className="text-sm font-bold text-gray-200">{org.memberCount || 0}</span>
            </div>
            <span className="text-[10px] text-gray-500 uppercase font-black tracking-tighter italic">Total Miembros</span>
          </div>
        );
      }
    },
    {
      header: "Suscripción",
      className: "min-w-[200px]",
      cell: (org) => {
        if (isLoading) {
          return (
            <div className="flex flex-col gap-2">
              <Skeleton className="h-5 w-24 rounded-full" />
              <Skeleton className="h-3 w-32" />
            </div>
          );
        }
        const sub = org.latestSubscription;
        if (!sub) {
          return (
            <div className="flex flex-col gap-0.5">
              <Text size="xs" weight="bold" className="text-amber-500/80 uppercase tracking-widest italic">Sin Suscripción</Text>
              <Text size="xs" variant="muted" className="opacity-40">No hay planes vinculados.</Text>
            </div>
          );
        }

        const isExpired = new Date(sub.endDate) < new Date();
        const statusVariants: Record<string, "success" | "warning" | "destructive" | "info" | "default"> = {
          active: 'success',
          past_due: 'warning',
          read_only: 'default',
          suspended: 'destructive',
          canceled: 'destructive'
        };

        return (
          <div className="flex flex-col gap-1.5">
            <div className="flex items-center gap-2">
              <Badge variant={statusVariants[sub.status] || 'default'} className="uppercase text-[9px] font-black tracking-tighter h-5 px-2">
                {sub.planName || 'Plan Personalizado'}
              </Badge>
              {sub.isTrial && <Badge variant="info" className="uppercase text-[9px] font-black tracking-tighter h-5">Prueba</Badge>}
            </div>
            <Text size="xs" className="text-slate-500 font-medium">
              {isExpired ? 'Expiró: ' : 'Expira: '}
              <span className={isExpired ? "text-rose-500 font-bold" : "text-slate-300 font-bold"}>
                {format(new Date(sub.endDate), "dd MMM yyyy", { locale: es })}
              </span>
            </Text>
          </div>
        );
      }
    },
    {
      header: "Acciones",
      className: "pr-6 text-right w-[240px]",
      headerClassName: "pr-6 text-right",
      cell: (org) => {
        if (isLoading) {
          return (
            <div className="flex items-center justify-end gap-2">
              <Skeleton className="h-9 w-20 rounded-md" />
              <Skeleton className="h-9 w-9 rounded-md" />
              <Skeleton className="h-9 w-9 rounded-md" />
              <Skeleton className="h-9 w-9 rounded-md" />
            </div>
          );
        }
        return (
          <div className="flex items-center justify-end gap-2">
            {variant === 'detailed' ? (
              <>
                <Button
                  variant={org.latestSubscription ? "outlined" : "primary"}
                  size="sm"
                  onClick={() => onAddSubscription?.(org)}
                  className="h-9 text-[10px] font-black uppercase tracking-widest px-3 border-white/10 hover:bg-white/5"
                  title={org.latestSubscription ? "Gestionar Plan" : "Vincular Plan"}
                >
                  <CreditCard size={14} className="mr-2" />
                  {org.latestSubscription ? 'Plan' : 'Vincular'}
                </Button>
                <Button
                  variant="outlined"
                  size="sm"
                  onClick={() => onEdit?.(org)}
                  className="bg-transparent border-white/10 hover:bg-white/10 h-9 p-0 w-9 flex items-center justify-center shrink-0"
                  title="Editar Información"
                >
                  <Edit2 size={14} />
                </Button>
                <Button
                  variant="outlined"
                  size="sm"
                  onClick={() => router.push(`/dashboard/platform/organizations/${org.id}/settings`)}
                  className="bg-transparent border-white/10 hover:bg-white/10 h-9 p-0 w-9 flex items-center justify-center shrink-0"
                  title="Configuración Técnica"
                >
                  <Settings size={14} className="text-gray-400" />
                </Button>
                <Button
                  variant="primary"
                  size="sm"
                  onClick={() => window.open(`/dashboard/platform/organizations/${org.id}`, '_blank')}
                  className="h-9 w-9 p-0 flex items-center justify-center shrink-0"
                  title="Acceder a Sede"
                >
                  <ExternalLink size={16} />
                </Button>
              </>
            ) : (() => {
              const currentSubStatus = org.latestSubscription?.status || 'pending';
              let calcStatus: 'active' | 'inactive' | 'pending' = 'pending';
              if (currentSubStatus === 'active') {
                calcStatus = 'active';
              } else if (org.latestSubscription) {
                calcStatus = 'inactive';
              }

              return (
                <OrganizationActions
                  organizationId={org.id}
                  status={calcStatus}
                  onEdit={() => onEdit?.(org)}
                  onSettings={() => router.push(`/dashboard/platform/organizations/${org.id}/settings`)}
                  onAddSubscription={() => onAddSubscription?.(org)}
                />
              );
            })()}
          </div>
        );
      }
    }
  ];

  // Optional: Filter columns based on variant if strictly needed, 
  // but showing all for 'detailed' makes the table feel denser.
  return columns;
};

export function OrganizationsTable({
  organizations,
  isLoading,
  onSuccess,
  onEdit,
  onAddSubscription,
  variant = 'simple'
}: OrganizationsTableProps) {
  const router = useRouter();
  const columns = React.useMemo(() =>
    getColumns(onSuccess ?? (() => { }), onEdit, onAddSubscription, variant, isLoading, router),
    [onSuccess, onEdit, onAddSubscription, variant, isLoading, router]
  );

  const displayData = React.useMemo(() => {
    if (isLoading && organizations.length === 0) {
      return Array.from({ length: 5 }).map((_, i) => ({ id: `skeleton-${i}` } as IPlatformOrganization));
    }
    return organizations;
  }, [organizations, isLoading]);

  return (
    <Table
      columns={columns}
      data={displayData}
    />
  );
}
