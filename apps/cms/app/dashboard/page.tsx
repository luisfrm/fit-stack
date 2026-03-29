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
  AlertItem 
} from "@/components/dashboard/dashboard-ui";
import { MemberModal } from "@/components/members/member-modal";
import { type IClassToday, type IRecentRegistration, type MemberPlan } from "@/types/dashboard";

/* ─────────────────────────────────────────────
   STATIC DATA
   ───────────────────────────────────────────── */

const CLASSES_TODAY: IClassToday[] = [
  { time: "08:00 AM", name: "CrossFit Advance",  trainer: "Carlos Ruiz",   occupancy: 85, status: "live"      },
  { time: "10:30 AM", name: "Hatha Yoga",         trainer: "Ana López",     occupancy: 45, status: "scheduled" },
  { time: "12:00 PM", name: "Boxeo Recreativo",   trainer: "Marcos Sanz",   occupancy: 0,  status: "cancelled" },
  { time: "04:00 PM", name: "Pilates Reformer",   trainer: "Elena Gomez",   occupancy: 60, status: "scheduled" },
];

const RECENT_REGISTRATIONS: IRecentRegistration[] = [
  { name: "Juan Pérez",   time: "Hace 15 min",  plan: "vip"   as MemberPlan },
  { name: "Lucía Méndez", time: "Hace 45 min",  plan: "pro"   as MemberPlan },
  { name: "Roberto Diaz", time: "Hace 1 hora",  plan: "basic" as MemberPlan },
  { name: "Sofía Castro", time: "Hace 3 horas", plan: "vip"   as MemberPlan },
  { name: "Marco Polo",   time: "Ayer",          plan: "pro"   as MemberPlan },
];

export default async function DashboardPage() {
  return (
    <>
      {/* ── Header ── */}
      <header className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-10">
        <div>
          <h2 className="text-2xl lg:text-3xl font-bold text-slate-100">Panel de Control</h2>
          <Text variant="muted">Bienvenido de nuevo, aquí está el resumen de hoy.</Text>
        </div>
        <div className="flex gap-3">
          <Button variant="glass" size="sm" leftIcon={<Download className="w-4 h-4" />}>
            Reporte
          </Button>
          <MemberModal 
            trigger={
              <Button variant="primary" size="sm" leftIcon={<Plus className="w-4 h-4" />}>
                Nuevo Miembro
              </Button>
            }
          />
        </div>
      </header>

      {/* ── KPI Cards ── */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-10">
        <KpiCard
          label="Miembros Activos"
          value="1,250"
          icon="users"
          trend={{ value: "+5%", direction: "up" }}
        />
        <KpiCard
          label="Ingresos del Mes"
          value="$45,280"
          icon="wallet"
          trend={{ value: "-2%", direction: "down" }}
        />
        <KpiCard
          label="Clases Hoy"
          value="24"
          icon="calendar"
          trend={{ value: "Hoy", direction: "neutral" }}
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
            <button className="text-primary text-sm font-medium hover:underline">Ver todas</button>
          </div>
          <TodayClassesTable classes={CLASSES_TODAY} />
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
            severity="danger"
            title="Pago rechazado: Terminal 04"
            description="Error de comunicación con el banco emisor."
            actionLabel="Ver"
          />
          <AlertItem
            severity="success"
            title="Inventario actualizado"
            description="Suplementos deportivos recibidos y cargados."
            actionLabel="Ok"
          />
        </div>
      </section>
    </>
  );
}
