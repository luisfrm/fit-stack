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

interface OrganizationsResultsProps {
  readonly organizations: IPlatformOrganization[];
}

export function OrganizationsResults({ organizations }: OrganizationsResultsProps) {
  const [selectedOrg, setSelectedOrg] = React.useState<IPlatformOrganization | null>(null);
  const [isSubModalOpen, setIsSubModalOpen] = React.useState(false);
  const router = useRouter();

  const refresh = () => router.refresh();
  const handleAddSubscription = (org: IPlatformOrganization) => {
    setSelectedOrg(org);
    setIsSubModalOpen(true);
  };

  if (organizations.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center p-20 bg-white/5 border border-dashed border-white/10 rounded-3xl gap-4">
        <Building2 size={48} className="text-slate-700" />
        <div className="text-center">
          <Text size="lg" weight="bold" className="text-slate-400 uppercase tracking-tighter italic">Sin Resultados</Text>
          <Text size="xs" variant="muted">Prueba con otra búsqueda o crea una nueva organización.</Text>
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="hidden lg:block">
        <OrganizationsTable
          organizations={organizations}
          onSuccess={refresh}
          onAddSubscription={handleAddSubscription}
          EditModal={OrganizationModal}
        />
      </div>

      <div className="lg:hidden grid grid-cols-1 md:grid-cols-2 gap-4">
        {organizations.map((org) => (
          <OrganizationMobileCard
            key={org.id}
            org={org}
            onSuccess={refresh}
            onAddSubscription={handleAddSubscription}
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
