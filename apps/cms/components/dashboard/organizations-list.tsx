"use client";

import * as React from "react";
import { Text, Card } from "@workspace/ui/components";
import { OrganizationsTable } from "./organizations-table";
import { OrganizationMobileCard } from "./organization-mobile-card";
import { type IPlatformOrganization } from "@workspace/shared/types";

interface OrganizationsListProps {
  readonly organizations: IPlatformOrganization[];
  readonly isLoading?: boolean;
  readonly onSuccess?: () => void;
}

export function OrganizationsList({ organizations, isLoading, onSuccess }: OrganizationsListProps) {
  if (organizations.length === 0 && !isLoading) {
    return (
      <Card className="bg-white/5 backdrop-blur-md rounded-xl p-20 flex flex-col items-center justify-center gap-4 text-center border-2 border-dashed border-white/5 min-h-[400px]">
        <Text variant="muted" size="lg" weight="bold">No hay resultados</Text>
        <Text variant="muted" size="sm">Aún no se han registrado gimnasios en la plataforma.</Text>
      </Card>
    );
  }

  return (
    <>
      {/* Desktop View: Table */}
      <div className="hidden md:block">
        <Card className="bg-white/5 border-none backdrop-blur-md rounded-xl overflow-hidden min-h-[400px] py-0">
          <OrganizationsTable
            organizations={organizations}
            isLoading={isLoading}
            onSuccess={onSuccess}
            variant="simple"
          />
        </Card>
      </div>

      {/* Mobile View: Cards */}
      <div className="grid grid-cols-1 gap-4 md:hidden">
        {isLoading ? (
          Array.from({ length: 4 }).map((_, i) => (
            <OrganizationMobileCard key={`mobile-skeleton-${crypto.randomUUID?.() || i}`} org={{} as any} isLoading={true} />
          ))
        ) : (
          organizations.map((org) => (
            <OrganizationMobileCard key={org.id} org={org} />
          ))
        )}
      </div>
    </>
  );
}
