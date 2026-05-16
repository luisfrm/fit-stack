"use client";

import * as React from "react";
import { useSearchParams } from "next/navigation";
import { GymDashboard } from "@/components/dashboard/gym-dashboard";
import { toast, SplashScreen } from "@workspace/ui/components";
import { useAuth } from "@/lib/hooks/use-auth";

export default function DashboardPage() {
  const { session, isPending } = useAuth();
  const searchParams = useSearchParams();

  React.useEffect(() => {
    if (searchParams.get("status") === "unauthorized") {
      toast.error("No tienes permisos para acceder a este módulo");
    }
  }, [searchParams]);

  if (isPending) {
    return <SplashScreen fullScreen={false} message="Cargando entorno..." />;
  }

  return <GymDashboard />;
}