"use client";

import * as React from "react";
import { AlertTriangle, RefreshCcw, Home } from "lucide-react";
import { Button, Text } from "@workspace/ui/components";

export default function DashboardError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  React.useEffect(() => {
    console.error("[Panel Dashboard Error]", error);
  }, [error]);

  const safeMessage = "Ha ocurrido un error inesperado al cargar esta vista.";

  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] gap-6 p-8">
      <div className="p-4 bg-destructive/10 rounded-2xl border border-destructive/20">
        <AlertTriangle size={48} className="text-destructive" />
      </div>
      <div className="text-center space-y-2 max-w-md">
        <Text size="lg" weight="bold" className="text-white">
          Algo salió mal
        </Text>
        <Text size="sm" variant="muted">
          {safeMessage}
        </Text>
      </div>
      <div className="flex items-center gap-3">
        <Button variant="primary" size="sm" onClick={reset} leftIcon={<RefreshCcw size={16} />}>
          Reintentar
        </Button>
        <Button variant="outlined" size="sm" asChild leftIcon={<Home size={16} />}>
          <a href="/dashboard">Volver al inicio</a>
        </Button>
      </div>
    </div>
  );
}
