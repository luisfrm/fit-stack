"use client";

import * as React from "react";
import { Loader2 } from "lucide-react";
import { Text, Card } from "@workspace/ui/components";
import { OrganizationsTable } from "./organizations-table";
import { OrganizationMobileCard, type Organization } from "./organization-mobile-card";

interface OrganizationsListProps {
  readonly organizations: Organization[];
  readonly isLoading?: boolean;
  readonly onSuccess?: () => void;
}

export function OrganizationsList({ organizations, isLoading, onSuccess }: OrganizationsListProps) {
  if (isLoading) {
    return (
      <Card className="bg-white/5 border-none backdrop-blur-md rounded-xl p-20 flex flex-col items-center justify-center gap-4 min-h-[400px]">
        <Loader2 className="animate-spin text-primary" size={32} />
        <Text variant="muted">Cargando organizaciones de la plataforma...</Text>
      </Card>
    );
  }

  if (organizations.length === 0) {
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
            onSuccess={onSuccess}
          />
        </Card>
      </div>

      {/* Mobile View: Cards */}
      <div className="grid grid-cols-1 gap-4 md:hidden">
        {organizations.map((org) => (
          <OrganizationMobileCard key={org.id} org={org} />
        ))}
      </div>
    </>
  );
}
