"use client";

import * as React from "react";
import { useSession } from "@/lib/auth-client";
import { useSearchParams } from "next/navigation";
import { ISession, GLOBAL_ROLES } from "@workspace/shared";
import { GymDashboard } from "@/components/dashboard/gym-dashboard";
import { SaaSAdminDashboard } from "@/components/dashboard/saas-admin-dashboard";
import { toast } from "@workspace/ui/components";

export default function DashboardPage() {
  const { data: sessionData, isPending } = useSession();
  const searchParams = useSearchParams();
  const { user, session: currentSession } = (sessionData as unknown as ISession) || {};

  React.useEffect(() => {
    if (searchParams.get("status") === "unauthorized") {
      toast.error("No tienes permisos para acceder a este módulo");
    }
  }, [searchParams]);

  if (isPending) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4">
        <div className="w-8 h-8 rounded-full border-t-2 border-r-2 border-primary animate-spin" />
        <p className="text-gray-400 animate-pulse">Cargando tablero...</p>
      </div>
    );
  }

  // Si el usuario es 'admin' (Master Admin) Y NO tiene una organización activa, mostramos el dashboard del SaaS
  if (user?.role === GLOBAL_ROLES.ADMIN && !currentSession?.activeOrganizationId) {
    return <SaaSAdminDashboard />;
  }

  // Por defecto (role 'user' o sin rol asignado pero con sesión activa), mostramos el dashboard del Gimnasio
  return <GymDashboard />;
}
