"use client";

import * as React from "react";
import { Building2 } from "lucide-react";
import {
  Card,
  Text,
  Badge
} from "@workspace/ui/components";
import { OrganizationActions } from "./organization-actions";

export interface Organization {
  readonly id: string;
  readonly name: string;
  readonly slug: string; // Añadido para gestión
  readonly domain: string;
  readonly memberCount: number;
  readonly status: 'active' | 'inactive' | 'pending';
  readonly logo?: string;
  readonly countryCode?: string;
  readonly taxId?: string;
  readonly legalName?: string;
  readonly address?: string;
  readonly metadata?: Record<string, any>; // Estructurado
}

interface OrganizationMobileCardProps {
  readonly org: Organization;
}

export function OrganizationMobileCard({ org }: OrganizationMobileCardProps) {
  const statusVariants: Record<Organization['status'], "default" | "outline" | "destructive" | "secondary"> = {
    active: 'default',
    pending: 'outline',
    inactive: 'destructive'
  };

  const badgeVariant = statusVariants[org.status] || 'secondary';

  return (
    <Card className="bg-white/5 border-none backdrop-blur-md p-5 rounded-xl space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="size-10 bg-primary/20 rounded-full flex items-center justify-center">
            <Building2 size={20} className="text-primary" />
          </div>
          <div className="min-w-0">
            <Text weight="bold" truncate className="block">{org.name}</Text>
            <Text size="xs" variant="muted" truncate className="block font-medium">{org.domain}</Text>
          </div>
        </div>
        <Badge variant={badgeVariant}>
          {org.status}
        </Badge>
      </div>

      <div className="flex justify-between items-center pt-2 border-t border-white/5">
        <div className="flex flex-col">
          <Text size="xs" variant="muted" weight="bold" uppercase className="tracking-tighter font-medium">Miembros</Text>
          <Text weight="bold">{org.memberCount}</Text>
        </div>
        {/* Usamos el componente de acciones también en mobile */}
        <OrganizationActions
          organizationId={org.id}
          status={org.status}
        />
      </div>
    </Card>
  );
}
