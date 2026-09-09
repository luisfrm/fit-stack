"use client";

import { ShieldAlert, Users } from "lucide-react";
import { Badge, Card, Text } from "@workspace/ui/components";
import {
  PLATFORM_ROLE_LABELS,
  formatPlatformRole,
  type PlatformRole,
} from "@workspace/shared";
import { useAuth } from "@/lib/hooks/use-auth";
import type { PlatformStaffMember } from "@/lib/services/staff-service";
import { getStaffRoleCounts } from "@/lib/staff-role-counts";

const ROLE_ORDER = ["owner", "admin", "support"] as const;

export function StaffSidePanel({ staff }: { readonly staff: PlatformStaffMember[] }) {
  const { user } = useAuth();
  const counts = getStaffRoleCounts(staff);

  return (
    <div className="flex flex-col gap-6">
      <Card id="staff-side-team" className="p-6 flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <Text as="p" size="lg" weight="bold">
            Equipo
          </Text>
          <div className="p-2 bg-primary/10 rounded-lg text-primary">
            <Users size={16} />
          </div>
        </div>

        <div className="flex items-baseline gap-2">
          <Text size="lg" weight="bold" className="text-white tabular-nums text-3xl">
            {counts.total}
          </Text>
          <Text size="xs" variant="muted" className="uppercase font-bold tracking-widest">
            Miembros
          </Text>
        </div>

        <div className="flex flex-col divide-y divide-white/5 border-t border-white/5">
          {ROLE_ORDER.map((role) => (
            <div key={role} className="flex items-center justify-between py-2.5">
              <Text size="sm" variant="muted">
                {PLATFORM_ROLE_LABELS[role] ?? role}
              </Text>
              <Text size="sm" weight="bold" className="tabular-nums">
                {counts[role]}
              </Text>
            </div>
          ))}
        </div>

        <div className="flex items-center justify-between pt-2 border-t border-white/5">
          <Text size="xs" variant="muted" className="uppercase font-bold tracking-widest">
            Tu rol
          </Text>
          <Badge variant="outline">
            {formatPlatformRole((user?.role || "user") as PlatformRole)}
          </Badge>
        </div>
      </Card>

      <Card id="staff-side-security" className="p-6 flex flex-col gap-3">
        <Text as="p" size="lg" weight="bold">
          Seguridad
        </Text>

        {counts.owner === 0 ? (
          <div className="flex items-start gap-2 rounded-lg border border-warning/30 bg-warning/5 p-3">
            <ShieldAlert size={16} className="text-warning shrink-0 mt-0.5" />
            <Text size="xs" variant="muted">
              Sin propietario: ningún administrador puede asignar el rol
              Propietario. Promueve uno directamente en la base de datos.
            </Text>
          </div>
        ) : (
          <Text size="xs" variant="muted">
            {counts.owner === 1
              ? "Hay 1 propietario en la plataforma."
              : `Hay ${counts.owner} propietarios en la plataforma.`}{" "}
            Nunca se puede revocar al último.
          </Text>
        )}

        <div className="flex flex-col gap-1.5 pt-1">
          <Text size="xs" variant="muted">
            · Un administrador solo puede asignar Soporte o Administrador.
          </Text>
          <Text size="xs" variant="muted">
            · No puedes revocar tu propio acceso.
          </Text>
        </div>
      </Card>
    </div>
  );
}
