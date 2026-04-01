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
import { type IClassToday, type IRecentRegistration } from "@/types/dashboard";
import { classesService } from "@/lib/services/classes-service";
import { subscriptionsService } from "@/lib/services/subscriptions-service";
import { DEFAULT_TIMEZONE } from "@/lib/config/display";

/* ── PAGE ── */

function getRelativeTime(dateStr: string) {
  const now = new Date();
  const past = new Date(dateStr);
  const diffInMs = now.getTime() - past.getTime();
  const diffInMins = Math.floor(diffInMs / (1000 * 60));
  const diffInHours = Math.floor(diffInMs / (1000 * 60 * 60));
  const diffInDays = Math.floor(diffInMs / (1000 * 60 * 60 * 24));

  if (diffInMins < 2) return "Ahora mismo";
  if (diffInMins < 60) return `Hace ${diffInMins} min`;
  if (diffInHours < 24) return `Hace ${diffInHours} ${diffInHours === 1 ? 'hora' : 'horas'}`;
  if (diffInDays === 1) return 'Ayer';
  return past.toLocaleDateString('es-ES', { day: 'numeric', month: 'short' });
}

export default function DashboardPage() {
  const [todayClasses, setTodayClasses] = React.useState<IClassToday[]>([]);
  const [isLoadingClasses, setIsLoadingClasses] = React.useState(true);
  const [recentRegistrations, setRecentRegistrations] = React.useState<IRecentRegistration[]>([]);
  const [isLoadingRegistrations, setIsLoadingRegistrations] = React.useState(true);

  React.useEffect(() => {
    // Fetch classes
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

    // Fetch recent registrations
    subscriptionsService.getRecent(5)
      .then((data) => {
        const mapped: IRecentRegistration[] = data.map(sub => ({
          name: sub.name,
          time: getRelativeTime(sub.createdAt),
        }));
        setRecentRegistrations(mapped);
      })
      .catch(() => setRecentRegistrations([]))
      .finally(() => setIsLoadingRegistrations(false));
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
          <RecentRegistrationsList registrations={recentRegistrations} />
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
