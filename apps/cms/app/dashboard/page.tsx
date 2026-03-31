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
  KpiCard,
  TodayClassesTable,
  RecentRegistrationsList,
  AlertItem,
} from "@/components/dashboard/dashboard-ui";
import { MemberModal } from "@/components/members/member-modal";
import { type IClassToday, type IRecentRegistration, type MemberPlan } from "@/types/dashboard";
import { classesService } from "@/lib/services/classes-service";
import { DEFAULT_TIMEZONE } from "@/lib/config/display";

/* ─────────────────────────────────────────────
   STATIC DATA (will be replaced as modules grow)
   ───────────────────────────────────────────── */

const RECENT_REGISTRATIONS: IRecentRegistration[] = [
  { name: "Juan Pérez",   time: "Hace 15 min",  plan: "vip"   as MemberPlan },
  { name: "Lucía Méndez", time: "Hace 45 min",  plan: "pro"   as MemberPlan },
  { name: "Roberto Diaz", time: "Hace 1 hora",  plan: "basic" as MemberPlan },
  { name: "Sofía Castro", time: "Hace 3 horas", plan: "vip"   as MemberPlan },
  { name: "Marco Polo",   time: "Ayer",          plan: "pro"   as MemberPlan },
];

/* ─────────────────────────────────────────────
   PAGE
   ───────────────────────────────────────────── */

export default function DashboardPage() {
  const [todayClasses, setTodayClasses] = React.useState<IClassToday[]>([]);
  const [isLoadingClasses, setIsLoadingClasses] = React.useState(true);

  React.useEffect(() => {
    // Use the configured timezone so "today" matches the gym's local date.
    const today = new Intl.DateTimeFormat('en-CA', { // en-CA gives YYYY-MM-DD
      timeZone: DEFAULT_TIMEZONE,
    }).format(new Date());

    classesService.getClassesByDate(today)
      .then((raw) => {
        const mapped: IClassToday[] = raw.map((cls) => ({
          id: cls.id,
          name: cls.name,
          startTime: cls.startTime,
          endTime: cls.endTime,
          trainerName: cls.trainerName,
          capacity: cls.capacity,
        }));
        mapped.sort((a, b) => a.startTime.localeCompare(b.startTime));
        setTodayClasses(mapped);
      })
      .catch(() => setTodayClasses([]))
      .finally(() => setIsLoadingClasses(false));
  }, []);

  return (
    <>
      {/* ── Header ── */}
      <header className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-10">
        <div>
          <h2 className="text-2xl lg:text-3xl font-bold text-slate-100">Panel de Control</h2>
          <Text variant="muted">Bienvenido de nuevo, aquí está el resumen de hoy.</Text>
        </div>
        <div className="flex gap-3">
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
        </div>
      </header>

      {/* ── KPI Cards ── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-6 mb-10">
        <KpiCard
          label="Miembros Activos"
          value="248"
          icon="users"
          trend={{ value: "+12 este mes", direction: "up" }}
        />
        <KpiCard
          label="Clases Hoy"
          value={isLoadingClasses ? "—" : String(todayClasses.length)}
          icon="calendar"
          trend={{ value: "programadas", direction: "neutral" }}
        />
        <KpiCard
          label="Ingresos del Mes"
          value="$12,430"
          icon="wallet"
          trend={{ value: "+8% vs mes anterior", direction: "up" }}
        />
        <KpiCard
          label="Membresías por Vencer"
          value="12"
          icon="alert"
          trend={{ value: "Próx. 7 días", direction: "neutral" }}
          accent
        />
      </div>

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
          <RecentRegistrationsList registrations={RECENT_REGISTRATIONS} />
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
