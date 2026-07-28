"use client";

import * as React from "react";
import { useSearchParams } from "next/navigation";
import { toast } from "@workspace/ui/components";

export function DashboardStatusToaster() {
  const searchParams = useSearchParams();

  React.useEffect(() => {
    if (searchParams.get("status") === "unauthorized") {
      toast.error("No tienes permisos para acceder a este módulo");
    }
  }, [searchParams]);

  return null;
}
