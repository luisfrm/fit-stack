"use client";

import * as React from "react";
import { Modal, Input, Button } from "@workspace/ui/components";

interface CancelSubscriptionModalProps {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly onConfirm: (reason: string | undefined) => Promise<void> | void;
  readonly isLoading?: boolean;
  readonly className?: string;
}

export function CancelSubscriptionModal({
  open,
  onOpenChange,
  onConfirm,
  isLoading = false,
  className,
}: CancelSubscriptionModalProps) {
  const [reason, setReason] = React.useState("");

  React.useEffect(() => {
    if (!open) setReason("");
  }, [open]);

  const handleConfirm = async () => {
    await onConfirm(reason.trim() || undefined);
  };

  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      trigger={null}
      className={className}
      title="Cancelar Suscripción"
      description="Esta acción no se puede deshacer."
      footer={
        <>
          <Button
            variant="outlined"
            onClick={() => onOpenChange(false)}
            disabled={isLoading}
          >
            Volver
          </Button>
          <Button variant="danger" onClick={handleConfirm} disabled={isLoading}>
            {isLoading ? "Cancelando..." : "Confirmar Cancelación"}
          </Button>
        </>
      }
    >
      <Input
        label="Motivo (opcional)"
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        placeholder="Ej: Cliente solicitó baja"
      />
    </Modal>
  );
}
