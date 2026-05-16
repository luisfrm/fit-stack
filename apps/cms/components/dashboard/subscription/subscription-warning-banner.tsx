"use client";

import * as React from "react";
import { AlertTriangle, X } from "lucide-react";
import { Text } from "@workspace/ui/components";

export function SubscriptionWarningBanner() {
  return (
    <div className="flex items-center gap-3 px-4 py-3 bg-amber-500/10 border border-amber-500/20 rounded-xl mb-4">
      <div className="p-2 bg-amber-500/10 rounded-lg shrink-0">
        <AlertTriangle className="w-4 h-4 text-amber-400" />
      </div>
      <div className="flex-1 min-w-0">
        <Text size="sm" weight="semibold" className="text-amber-200">
          Tu suscripción ha vencido
        </Text>
        <Text size="xs" variant="muted" className="text-amber-200/70">
          El servicio será suspendido próximamente. Contacta al proveedor para renovar.
        </Text>
      </div>
    </div>
  );
}