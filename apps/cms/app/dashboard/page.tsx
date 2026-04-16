"use client";

import * as React from "react";
import { useAuth } from "@/lib/hooks/use-auth";
import { useSearchParams } from "next/navigation";
import { GLOBAL_ROLES } from "@workspace/shared";
import { GymDashboard } from "@/components/dashboard/gym-dashboard";
import { SaaSAdminDashboard } from "@/components/dashboard/saas-admin-dashboard";
import { toast, SplashScreen } from "@workspace/ui/components";

export default function DashboardPage() {
  const { session, isPending, user } = useAuth();
  const searchParams = useSearchParams();

  React.useEffect(() => {
    if (searchParams.get("status") === "unauthorized") {
      toast.error("No tienes permisos para acceder a este módulo");
    }
  }, [searchParams]);

  if (isPending) {
    return <SplashScreen fullScreen={false} message="Cargando entorno..." />;
  }

  // Si el usuario es 'admin' (Master Admin) Y NO tiene una organización activa, mostramos el dashboard del SaaS
  if (user?.role === GLOBAL_ROLES.ADMIN && !session?.session?.activeOrganizationId) {
    return <SaaSAdminDashboard />;
  }

  // Por defecto (role 'user' o sin rol asignado pero con sesión activa), mostramos el dashboard del Gimnasio
  return <GymDashboard />;
}
