"use client";

import * as React from "react";
import Link from "next/link";
import { Download, Plus } from "lucide-react";
import { Button } from "@workspace/ui/components/button";
import { Card } from "@workspace/ui/components/card";
import { Text } from "@workspace/ui/components/text";
import { TodayClassesTable } from "@/components/dashboard/today-classes-table";
import { RecentRegistrationsList } from "@/components/dashboard/recent-registrations";
import { AlertItem } from "@/components/dashboard/alert-item";
import { DashboardStatsView } from "@/components/dashboard/dashboard-stats";
import { MemberModal } from "@/components/members/member-modal";
import { DashboardHeader } from "@/components/dashboard/dashboard-header";
import { useRouter } from "next/navigation";
import type {
  IClassToday,
  IRecentRegistration,
} from "@workspace/shared/types";
import type { DashboardStats } from "@/lib/services/dashboard-service";

interface GymDashboardProps {
  readonly stats: DashboardStats;
  readonly todayClasses: IClassToday[];
  readonly recentRegistrations: IRecentRegistration[];
}

export function GymDashboard({
  stats,
  todayClasses,
  recentRegistrations,
}: GymDashboardProps) {
  const router = useRouter();

  const onMemberCreated = () => {
    router.refresh();
  };

  return (
    <>
      <DashboardHeader
        title="Panel de Control"
        description="Bienvenido de nuevo, aquí está el resumen de hoy."
        iconName="LayoutDashboard"
      >
        <Button variant="glass" size="sm" leftIcon={<Download size={18} />}>
          Reporte
        </Button>
        <MemberModal
          onSuccess={onMemberCreated}
          trigger={
            <Button variant="primary" size="sm" leftIcon={<Plus size={18} />}>
              Nuevo Miembro
            </Button>
          }
        />
      </DashboardHeader>

      <DashboardStatsView stats={stats} />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 mb-10">
        <Card className="lg:col-span-2 overflow-hidden pb-0">
          <div className="p-6 border-b border-border flex justify-between items-center">
            <Text as="p" size="lg" weight="bold">Clases de Hoy</Text>
            <Link href="/classes" className="text-primary text-sm font-medium hover:underline">
              Ver todas
            </Link>
          </div>
          <TodayClassesTable classes={todayClasses} />
        </Card>

        <Card className="overflow-hidden flex flex-col">
          <div className="p-6 border-b border-border">
            <Text as="p" size="lg" weight="bold">Últimos Pagos</Text>
          </div>
          <RecentRegistrationsList registrations={recentRegistrations} />
        </Card>
      </div>

      <section>
        <Text as="p" size="lg" weight="bold" className="mb-4">Alertas Recientes</Text>
        <div className="flex flex-wrap gap-4">
          <AlertItem
            severity="warning"
            title="5 membresías vencen esta semana"
            description="Revisar lista de renovación para contactar miembros."
            actionLabel="Revisar"
          />
          <AlertItem
            severity="info"
            title="Nueva clase disponible"
            description="La clase de Pilates Avanzado ya está activa."
            actionLabel="Ver clase"
          />
        </div>
      </section>
    </>
  );
}
