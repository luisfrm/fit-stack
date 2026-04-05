"use client";

import * as React from "react";
import { useSession } from "@/lib/auth-client";
import { ISession, ROLES } from "@workspace/shared/types";
import { GymDashboard } from "@/components/dashboard/gym-dashboard";
import { SaaSAdminDashboard } from "@/components/dashboard/saas-admin-dashboard";

export default function DashboardPage() {
  const { data: sessionData, isPending } = useSession();
  const session = sessionData as unknown as ISession | null;

  if (isPending) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4">
        <div className="w-8 h-8 rounded-full border-t-2 border-r-2 border-primary animate-spin" />
        <p className="text-gray-400 animate-pulse">Cargando tablero...</p>
      </div>
    );
  }

  // Si el usuario es 'admin' (Master Admin), mostramos el dashboard del SaaS
  if (session?.user?.role === ROLES.ADMIN) {
    return <SaaSAdminDashboard />;
  }

  // Por defecto (role 'user' o sin rol asignado pero con sesión activa), mostramos el dashboard del Gimnasio
  return <GymDashboard />;
}
