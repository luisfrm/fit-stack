"use client";

import * as React from "react";
import { Modal, Button, Text } from "@workspace/ui/components";
import { SubscriptionStatusBadge } from "./subscription-status-badge";
import type { SubscriptionWithDetails } from "@/lib/services/platform-subscriptions-service";

interface DeleteSubscriptionModalProps {
  readonly subscription: SubscriptionWithDetails | null;
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly onConfirm: () => Promise<void> | void;
  readonly isLoading?: boolean;
  readonly className?: string;
}

export function DeleteSubscriptionModal({
  subscription,
  open,
  onOpenChange,
  onConfirm,
  isLoading = false,
  className,
}: DeleteSubscriptionModalProps) {
  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      trigger={null}
      className={className}
      title="Eliminar Registro"
      description="Esta acción elimina el registro de la suscripción y no se puede deshacer."
      footer={
        <>
          <Button
            variant="outlined"
            onClick={() => onOpenChange(false)}
            disabled={isLoading}
          >
            Volver
          </Button>
          <Button
            variant="danger"
            onClick={() => onConfirm()}
            disabled={isLoading}
          >
            {isLoading ? "Eliminando..." : "Confirmar Eliminación"}
          </Button>
        </>
      }
    >
      {subscription && (
        <div className="p-4 rounded-xl border border-white/10 bg-white/5 space-y-2">
          <Text weight="bold">
            {subscription.organizationName || subscription.organizationId}
          </Text>
          <div className="flex items-center gap-2">
            <Text size="sm" variant="muted">
              {subscription.planName ?? "Sin plan"}
            </Text>
            <SubscriptionStatusBadge status={subscription.status} />
          </div>
        </div>
      )}
    </Modal>
  );
}
