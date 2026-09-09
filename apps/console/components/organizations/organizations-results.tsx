"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Building2 } from "lucide-react";
import { Text } from "@workspace/ui/components";
import { OrganizationsTable } from "@/components/dashboard/organizations-table";
import { OrganizationMobileCard } from "@/components/dashboard/organization-mobile-card";
import { OrganizationModal } from "@/components/dashboard/organization-modal";
import { PlatformSubscriptionModal } from "@/components/platform/platform-subscription-modal";
import type { IPlatformOrganization } from "@workspace/shared/types";
import type { OrgAiQuota } from "@/lib/services/organizations-service";

interface OrganizationsResultsProps {
  readonly organizations: IPlatformOrganization[];
  readonly aiUsage?: Record<string, OrgAiQuota>;
  readonly totalFiltered?: number;
  readonly onRefreshServer?: () => Promise<void>;
}

export function OrganizationsResults({
  organizations,
  aiUsage,
  totalFiltered,
  onRefreshServer,
}: OrganizationsResultsProps) {
  const [selectedOrg, setSelectedOrg] =
    React.useState<IPlatformOrganization | null>(null);
  const [isSubModalOpen, setIsSubModalOpen] = React.useState(false);
  const router = useRouter();

  const refresh = React.useCallback(async () => {
    if (onRefreshServer) {
      await onRefreshServer();
    }
    router.refresh();
  }, [router, onRefreshServer]);
  const handleAddSubscription = (org: IPlatformOrganization) => {
    setSelectedOrg(org);
    setIsSubModalOpen(true);
  };
  const handleViewSubscriptions = (org: IPlatformOrganization) => {
    router.push(`/organizations/${org.slug ?? org.id}`);
  };

  if (organizations.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center p-20 bg-white/5 border border-dashed border-white/10 rounded-3xl gap-4">
        <Building2 size={48} className="text-slate-700" />
        <div className="text-center">
          <Text
            size="lg"
            weight="bold"
            className="text-slate-400 uppercase tracking-tighter italic"
          >
            Sin Resultados
          </Text>
          <Text size="xs" variant="muted">
            Prueba con otra búsqueda o crea una nueva organización.
          </Text>
        </div>
      </div>
    );
  }

  return (
    <>
      {totalFiltered !== undefined && (
        <Text size="xs" variant="muted" className="uppercase tracking-widest">
          {totalFiltered} organización(es)
        </Text>
      )}

      <div className="hidden lg:block" data-testid="orgs-table">
        <OrganizationsTable
          organizations={organizations}
          aiUsage={aiUsage}
          onSuccess={refresh}
          onAddSubscription={handleAddSubscription}
          onViewSubscriptions={handleViewSubscriptions}
          EditModal={OrganizationModal}
        />
      </div>

      <div
        className="lg:hidden grid grid-cols-1 md:grid-cols-2 gap-4"
        data-testid="orgs-cards"
      >
        {organizations.map((org) => (
          <OrganizationMobileCard
            key={org.id}
            org={org}
            aiQuota={aiUsage?.[org.id]}
            onSuccess={refresh}
            onAddSubscription={handleAddSubscription}
            onViewSubscriptions={handleViewSubscriptions}
            EditModal={OrganizationModal}
          />
        ))}
      </div>

      {selectedOrg && (
        <PlatformSubscriptionModal
          open={isSubModalOpen}
          onOpenChange={setIsSubModalOpen}
          initialOrganization={selectedOrg}
          onSuccess={refresh}
        />
      )}
    </>
  );
}
