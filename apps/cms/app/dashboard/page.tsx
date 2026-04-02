"use client";

import * as React from "react";
import Link from "next/link";
import {
  Download,
  Plus,
} from "lucide-react";

import { Button } from "@workspace/ui/components/button";
import { Card } from "@workspace/ui/components/card";
import { Text } from "@workspace/ui/components/text";
import {
  TodayClassesTable,
  RecentRegistrationsList,
  AlertItem,
} from "@/components/dashboard/dashboard-ui";
import { DashboardStats } from "@/components/dashboard/dashboard-stats";
import { MemberModal } from "@/components/members/member-modal";
import { DashboardHeader } from "@/components/dashboard/dashboard-header";
import { DEFAULT_TIMEZONE } from "@/lib/config/display";

import { useTodayClasses } from "@/lib/hooks/use-classes";
import { useRecentRegistrations } from "@/lib/hooks/use-payments";

/* ── PAGE ── */

export default function DashboardPage() {
  const today = new Intl.DateTimeFormat('en-CA', { // en-CA gives YYYY-MM-DD
    timeZone: DEFAULT_TIMEZONE,
  }).format(new Date());

  // React Query hooks
  const { data: todayClasses = [], isLoading: isLoadingClasses } = useTodayClasses(today);
  const { data: recentRegistrations = [], isLoading: isLoadingRegistrations } = useRecentRegistrations(5);

  return (
    <>
      {/* ── Header ── */}
      <DashboardHeader
        title="Panel de Control"
        description="Bienvenido de nuevo, aquí está el resumen de hoy."
        iconName="LayoutDashboard"
      >
        <Button variant="glass" size="sm" leftIcon={<Download size={18} />}>
          Reporte
        </Button>
        <MemberModal
          onSuccess={() => { /* Opción de recargar KPIs si fuera necesario */ }}
          trigger={
            <Button variant="primary" size="sm" leftIcon={<Plus size={18} />}>
              Nuevo Miembro
            </Button>
          }
        />
      </DashboardHeader>

      {/* ── KPI Cards ── */}
      <DashboardStats />

      {/* ── Central Grid ── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 mb-10">

        {/* Classes Table */}
        <Card className="lg:col-span-2 bg-white/5 border-none backdrop-blur-md rounded-xl overflow-hidden">
          <div className="p-6 border-b border-border-dark flex justify-between items-center">
            <Text as="p" size="lg" weight="bold">Clases de Hoy</Text>
            <Link href="/dashboard/classes" className="text-primary text-sm font-medium hover:underline">
              Ver todas
            </Link>
          </div>
          <TodayClassesTable classes={todayClasses} loading={isLoadingClasses} />
        </Card>

        {/* Recent Registrations */}
        <Card className="bg-white/5 border-none backdrop-blur-md rounded-xl overflow-hidden flex flex-col">
          <div className="p-6 border-b border-border-dark">
            <Text as="p" size="lg" weight="bold">Últimos Registros</Text>
          </div>
          <RecentRegistrationsList registrations={recentRegistrations} loading={isLoadingRegistrations} />
        </Card>
      </div>

      {/* ── Alerts ── */}
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
