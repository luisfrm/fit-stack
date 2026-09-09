"use client";

import * as React from "react";
import {
  Table,
  ColumnDef,
  Badge,
  NextImage,
  Text,
  Skeleton,
} from "@workspace/ui/components";
import { OrganizationActions } from "./organization-actions";
import { SubscriptionCell } from "./subscription-cell";
import { Building2, Users } from "lucide-react";
import { useRouter } from "next/navigation";
import { type AppRouterInstance } from "next/dist/shared/lib/app-router-context.shared-runtime";
import { IPlatformOrganization } from "@workspace/shared/types";
import { COUNTRIES } from "@workspace/shared/constants";
import { uploadService } from "@/lib/services/upload-service";
import {
  selectOrgHealth,
  type OrgHealth,
} from "@/lib/platform/organization-selectors";
import type { OrgAiQuota } from "@/lib/services/organizations-service";

interface OrganizationsTableProps {
  readonly organizations: IPlatformOrganization[];
  readonly isLoading?: boolean;
  readonly onSuccess?: () => void;
  readonly onEdit?: (org: IPlatformOrganization) => void;
  readonly onAddSubscription?: (org: IPlatformOrganization) => void;
  readonly onViewSubscriptions?: (org: IPlatformOrganization) => void;
  readonly aiUsage?: Record<string, OrgAiQuota>;
  readonly EditModal?: React.ComponentType<{
    initialData: IPlatformOrganization;
    onSuccess: () => void;
    trigger: React.ReactNode;
  }>;
}

function formatDate(date: string | Date) {
  return new Date(date).toLocaleDateString("es-ES", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

const HEALTH_CONFIG: Record<
  OrgHealth,
  { label: string; variant: "success" | "warning" | "destructive" }
> = {
  ok: { label: "Al día", variant: "success" },
  warn: { label: "Atención", variant: "warning" },
  down: { label: "Sin servicio", variant: "destructive" },
};

function formatCredits(value: number): string {
  if (value >= 1000)
    return `${(value / 1000).toFixed(value % 1000 === 0 ? 0 : 1)}K`;
  return `${value}`;
}

const getColumns = (
  onSuccess: () => void,
  onEdit?: (org: IPlatformOrganization) => void,
  onAddSubscription?: (org: IPlatformOrganization) => void,
  isLoading?: boolean,
  router?: AppRouterInstance,
  EditModal?: React.ComponentType<{
    initialData: IPlatformOrganization;
    onSuccess: () => void;
    trigger: React.ReactNode;
  }>,
  onViewSubscriptions?: (org: IPlatformOrganization) => void,
  aiUsage?: Record<string, OrgAiQuota>,
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
              {org.logo && org.logo.trim() !== "" ? (
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
              <Text
                size="sm"
                weight="bold"
                className="truncate uppercase tracking-tight italic leading-tight"
              >
                {org.name}
              </Text>
              <Text
                size="xs"
                variant="muted"
                className="truncate opacity-60 font-medium"
              >
                {org.slug}.fit-stack.com
              </Text>
            </div>
          </div>
        );
      },
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
                {org.countryCode || "??"}
              </div>
              <Text
                size="xs"
                weight="bold"
                className="text-gray-300 uppercase tracking-tighter"
              >
                {COUNTRIES[org.countryCode || ""]?.name ||
                  org.countryCode ||
                  "Global"}
              </Text>
            </div>
            <Text
              size="xs"
              variant="muted"
              className="opacity-50 font-mono tracking-widest text-[9px]"
            >
              {org.taxId || "SIN IDENTIFICADOR"}
            </Text>
          </div>
        );
      },
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
          <div className="flex flex-col gap-1">
            <div
              className="flex items-center gap-1.5"
              title="Usuarios con acceso a la App (Registrados)"
            >
              <Users size={12} className="text-primary" />
              <Text size="sm" weight="bold">
                {org.userCount || 0}
              </Text>
              <Text size="xs" weight="bold" className="uppercase">
                Registrados
              </Text>
            </div>
            <div
              className="flex items-center gap-1.5"
              title="Total de miembros en la base de datos local"
            >
              <div className="w-1 h-1 rounded-full bg-slate-500" />
              <Text size="sm" weight="bold" className="text-gray-400">
                {org.memberCount || 0}
              </Text>
              <Text
                size="xs"
                weight="bold"
                className="text-gray-500 uppercase font-medium tracking-tighter opacity-70"
              >
                Total Gym
              </Text>
            </div>
          </div>
        );
      },
    },
    {
      header: "Suscripción",
      className: "min-w-[200px]",
      cell: (org) => {
        if (isLoading) {
          return (
            <div className="flex flex-col gap-2">
              <Skeleton className="h-4 w-28" />
              <Skeleton className="h-5 w-20" />
            </div>
          );
        }
        const health = selectOrgHealth(org, new Date());
        const config = HEALTH_CONFIG[health];
        return (
          <div className="flex flex-col gap-1.5">
            <SubscriptionCell
              subscription={org.latestSubscription}
              isLoading={isLoading}
            />
            <Badge
              variant={config.variant}
              size="sm"
              data-testid={`org-health-${org.id}`}
              className="uppercase tracking-widest w-fit"
            >
              {config.label}
            </Badge>
          </div>
        );
      },
    },
    {
      header: "Alta",
      className: "w-[110px]",
      cell: (org) => {
        if (isLoading) {
          return <Skeleton className="h-4 w-16" />;
        }
        return (
          <Text size="sm" className="tabular-nums">
            {org.createdAt ? formatDate(org.createdAt) : "—"}
          </Text>
        );
      },
    },
    {
      header: "AI Credits",
      className: "w-[130px]",
      cell: (org) => {
        if (isLoading) {
          return (
            <div className="flex flex-col gap-2">
              <Skeleton className="h-4 w-14" />
              <Skeleton className="h-3 w-20" />
            </div>
          );
        }
        const quota = aiUsage?.[org.id];
        if (!quota) {
          return (
            <Text
              size="sm"
              variant="muted"
              className="opacity-50"
              data-testid={`org-ai-${org.id}`}
            >
              —
            </Text>
          );
        }
        if (quota.disabled) {
          return (
            <Text
              size="xs"
              variant="muted"
              className="uppercase tracking-widest opacity-60"
              data-testid={`org-ai-${org.id}`}
            >
              Desactivado
            </Text>
          );
        }
        if (quota.monthly.limit === 0) {
          return (
            <div
              className="flex flex-col gap-0.5"
              data-testid={`org-ai-${org.id}`}
            >
              <Text size="sm" weight="bold" className="tabular-nums">
                {formatCredits(quota.monthly.used)}
              </Text>
              <Text size="xs" variant="muted" className="opacity-50">
                Ilimitado
              </Text>
            </div>
          );
        }
        return (
          <div
            className="flex flex-col gap-0.5"
            data-testid={`org-ai-${org.id}`}
          >
            <Text size="sm" weight="bold" className="tabular-nums">
              {formatCredits(quota.monthly.used)}/
              {formatCredits(quota.monthly.limit)}
            </Text>
            <Text size="xs" variant="muted" className="opacity-50 tabular-nums">
              Restan{" "}
              {quota.remaining === null ? "—" : formatCredits(quota.remaining)}
            </Text>
          </div>
        );
      },
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
          <div
            className="flex items-center justify-end gap-2"
            data-testid={`org-row-${org.id}`}
          >
            <OrganizationActions
              organization={org}
              onEdit={() => onEdit?.(org)}
              onAddSubscription={() => onAddSubscription?.(org)}
              onViewSubscriptions={() => onViewSubscriptions?.(org)}
              onSuccess={onSuccess}
              EditModal={EditModal}
              menuClassName="org-row-menu"
            />
          </div>
        );
      },
    },
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
  onViewSubscriptions,
  aiUsage,
  EditModal,
}: OrganizationsTableProps) {
  const router = useRouter();
  const columns = React.useMemo(
    () =>
      getColumns(
        onSuccess ?? (() => {}),
        onEdit,
        onAddSubscription,
        isLoading,
        router,
        EditModal,
        onViewSubscriptions,
        aiUsage,
      ),
    [
      onSuccess,
      onEdit,
      onAddSubscription,
      isLoading,
      router,
      EditModal,
      onViewSubscriptions,
      aiUsage,
    ],
  );

  const displayData = React.useMemo(() => {
    if (isLoading && organizations.length === 0) {
      return Array.from({ length: 5 }).map(
        (_, i) => ({ id: `skeleton-${i}` }) as IPlatformOrganization,
      );
    }
    return organizations;
  }, [organizations, isLoading]);

  return <Table columns={columns} data={displayData} />;
}
