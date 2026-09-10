"use client";

import * as React from "react";
import { Card, Text, Badge, Button, Skeleton } from "@workspace/ui/components";
import { CreditCard, ExternalLink, Building2 } from "lucide-react";
import { OrganizationActions } from "./organization-actions";
import { selectOrgHealth } from "@/lib/platform/organization-selectors";

import { type IPlatformOrganization } from "@workspace/shared/types";
import type { OrgAiQuota } from "@/lib/services/organizations-service";

const HEALTH_STYLES: Record<string, string> = {
  ok: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
  warn: "bg-orange-500/10 text-orange-400 border-orange-500/20",
  down: "bg-red-500/10 text-red-400 border-red-500/20",
};

const HEALTH_LABELS: Record<string, string> = {
  ok: "Al día",
  warn: "Atención",
  down: "Sin servicio",
};

interface OrganizationMobileCardProps {
  readonly org: IPlatformOrganization;
  readonly isLoading?: boolean;
  readonly onEdit?: (org: IPlatformOrganization) => void;
  readonly onAddSubscription?: (org: IPlatformOrganization) => void;
  readonly onViewSubscriptions?: (org: IPlatformOrganization) => void;
  readonly onSuccess?: () => void;
  readonly status?: "active" | "inactive" | "pending";
  readonly aiQuota?: OrgAiQuota;
  readonly EditModal?: React.ComponentType<{
    initialData: IPlatformOrganization;
    onSuccess: () => void;
    trigger: React.ReactNode;
  }>;
}

export function OrganizationMobileCard({
  org,
  isLoading,
  onEdit,
  onAddSubscription,
  onViewSubscriptions,
  onSuccess,
  status: propStatus,
  aiQuota,
  EditModal,
}: OrganizationMobileCardProps) {
  if (isLoading) {
    return (
      <Card className="p-5 space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Skeleton className="size-10 rounded-full" />
            <div className="space-y-2">
              <Skeleton className="h-4 w-24" />
              <Skeleton className="h-3 w-32" />
            </div>
          </div>
          <Skeleton className="h-5 w-16 rounded-full" />
        </div>
        <div className="flex justify-between items-center pt-2 border-t border-border">
          <div className="space-y-1">
            <Skeleton className="h-2 w-12" />
            <Skeleton className="h-4 w-8" />
          </div>
          <Skeleton className="h-8 w-8 rounded-md" />
        </div>
        <div className="grid grid-cols-2 gap-2 pt-2 border-t border-border">
          <Skeleton className="h-10 w-full rounded-md" />
          <Skeleton className="h-10 w-full rounded-md" />
        </div>
      </Card>
    );
  }

  const computedStatus: "active" | "inactive" | "pending" =
    propStatus ??
    (() => {
      if (org.status === "active") return "active";
      if (org.latestSubscription) return "inactive";
      return "pending";
    })();

  const displayStatus: "active" | "inactive" | "pending" = computedStatus;

  const statusVariants: Record<
    string,
    "default" | "outline" | "destructive" | "secondary"
  > = {
    active: "default",
    pending: "outline",
    inactive: "destructive",
  };

  const badgeVariant = statusVariants[displayStatus] || "secondary";
  const health = selectOrgHealth(org, new Date());

  const formatDate = (date: string | Date) =>
    new Date(date).toLocaleDateString("es-ES", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    });

  return (
    <Card className="p-5 space-y-4 org-mobile-card">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="size-10 bg-primary/20 rounded-full flex items-center justify-center text-primary">
            <Building2 size={20} />
          </div>
          <div className="min-w-0">
            <Text weight="bold" truncate className="block">
              {org.name}
            </Text>
            <Text
              size="xs"
              variant="muted"
              truncate
              className="block font-medium"
            >
              {org.slug}.fit-stack.com
            </Text>
          </div>
        </div>
        <div className="flex flex-col items-end gap-1">
          <Badge variant={badgeVariant}>{displayStatus}</Badge>
          <span
            data-testid={`org-health-${org.id}`}
            className={`text-[10px] uppercase font-bold tracking-widest border rounded-full px-2 py-0.5 ${HEALTH_STYLES[health]}`}
          >
            {HEALTH_LABELS[health]}
          </span>
        </div>
      </div>

      <div className="flex justify-between items-center pt-2 border-t border-border">
        <div className="flex gap-6">
          <div className="flex flex-col">
            <Text
              size="xs"
              variant="muted"
              weight="bold"
              uppercase
              className="tracking-tighter font-medium"
            >
              Miembros
            </Text>
            <Text weight="bold">{org.memberCount || 0}</Text>
          </div>
          <div className="flex flex-col">
            <Text
              size="xs"
              variant="muted"
              weight="bold"
              uppercase
              className="tracking-tighter font-medium"
            >
              Alta
            </Text>
            <Text weight="bold" size="sm">
              {org.createdAt ? formatDate(org.createdAt) : "—"}
            </Text>
          </div>
          <div className="flex flex-col">
            <Text
              size="xs"
              variant="muted"
              weight="bold"
              uppercase
              className="tracking-tighter font-medium"
            >
              AI Credits
            </Text>
            <Text weight="bold" size="sm" data-testid={`org-ai-${org.id}`}>
              {!aiQuota || aiQuota.disabled
                ? "—"
                : aiQuota.monthly.limit === 0
                  ? `${aiQuota.monthly.used}`
                  : `${aiQuota.monthly.used}/${aiQuota.monthly.limit}`}
            </Text>
          </div>
        </div>
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

      <div className="grid grid-cols-2 gap-2 pt-2 border-t border-border">
        <Button
          variant="outlined"
          size="sm"
          onClick={() => onAddSubscription?.(org)}
          className="bg-transparent border-white/10 hover:bg-white/10 text-[10px] font-black uppercase tracking-widest py-3 h-auto"
        >
          <CreditCard size={14} className="mr-2 text-primary" />
          Plan
        </Button>
        <Button
          variant="primary"
          size="sm"
          onClick={() =>
            window.open(`/organizations/${org.slug ?? org.id}`, "_blank")
          }
          className="h-auto py-3 text-[10px] font-black uppercase tracking-widest"
        >
          <ExternalLink size={14} className="mr-2" />
          Entrar
        </Button>
      </div>
    </Card>
  );
}
