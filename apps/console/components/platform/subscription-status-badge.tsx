"use client";

import * as React from "react";
import { Badge } from "@workspace/ui/components";
import { PlatformSubscriptionStatus } from "@workspace/shared/types";
import { CheckCircle2, Clock, AlertTriangle, ShieldOff, XCircle } from "lucide-react";

interface SubscriptionStatusBadgeProps {
  status: PlatformSubscriptionStatus;
}

const STATUS_CONFIG: Record<PlatformSubscriptionStatus, { variant: "success" | "warning" | "destructive" | "default" | "outline"; label: string; icon: React.ReactNode; className?: string }> = {
  active: {
    variant: "success",
    label: "Activa",
    icon: <CheckCircle2 size={12} />,
  },
  past_due: {
    variant: "warning",
    label: "Por Vencer",
    icon: <Clock size={12} />,
  },
  read_only: {
    variant: "warning",
    label: "Solo Lectura",
    icon: <AlertTriangle size={12} />,
  },
  suspended: {
    variant: "destructive",
    label: "Suspendida",
    icon: <ShieldOff size={12} />,
  },
  cancelled: {
    variant: "default",
    label: "Cancelada",
    icon: <XCircle size={12} />,
    className: "bg-slate-500/10 text-slate-400 border-slate-500/20",
  },
};

export function SubscriptionStatusBadge({ status }: SubscriptionStatusBadgeProps) {
  const config = STATUS_CONFIG[status] || STATUS_CONFIG.suspended;

  return (
    <Badge
      variant={config.variant === "default" ? "outline" : config.variant}
      className={`flex items-center gap-1 px-2 py-0.5 pointer-events-none text-[10px] uppercase font-bold tracking-widest ${config.className || ''}`}
    >
      {config.icon}
      {config.label}
    </Badge>
  );
}