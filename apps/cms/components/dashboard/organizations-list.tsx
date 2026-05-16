"use client";

import * as React from "react";
import { Text, Card } from "@workspace/ui/components";
import { OrganizationsTable } from "./organizations-table";
import { OrganizationMobileCard } from "./organization-mobile-card";
import { OrganizationModal } from "./organization-modal";
import { type IPlatformOrganization } from "@workspace/shared/types";

interface OrganizationsListProps {
  readonly organizations: IPlatformOrganization[];
  readonly isLoading?: boolean;
  readonly onSuccess?: () => void;
}

export function OrganizationsList({ organizations, isLoading, onSuccess }: OrganizationsListProps) {
  if (organizations.length === 0 && !isLoading) {
    return (
      <Card className="p-20 flex flex-col items-center justify-center gap-4 text-center border-2 border-dashed border-border min-h-[400px]">
        <Text variant="muted" size="lg" weight="bold">No hay resultados</Text>
        <Text variant="muted" size="sm">Aún no se han registrado gimnasios en la plataforma.</Text>
      </Card>
    );
  }

  return (
    <>
      {/* Desktop View: Table */}
      <div className="hidden md:block">
        <Card className="overflow-hidden min-h-[400px] py-0">
          <OrganizationsTable
            organizations={organizations}
            isLoading={isLoading}
            onSuccess={onSuccess}
            variant="simple"
            EditModal={OrganizationModal}
          />
        </Card>
      </div>

      {/* Mobile View: Cards */}
      <div className="grid grid-cols-1 gap-4 md:hidden">
        {isLoading ? (
          Array.from({ length: 4 }).map((_, i) => (
            <OrganizationMobileCard key={`mobile-skeleton-${crypto.randomUUID?.() || i}`} org={{} as IPlatformOrganization} isLoading={true} />
          ))
        ) : (
          organizations.map((org) => (
            <OrganizationMobileCard
              key={org.id}
              org={org}
              onSuccess={onSuccess}
              EditModal={OrganizationModal}
            />
          ))
        )}
      </div>
    </>
  );
}
