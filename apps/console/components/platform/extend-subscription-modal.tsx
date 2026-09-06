"use client";

import * as React from "react";
import { Modal, Input, Button } from "@workspace/ui/components";
import { addDuration, DEFAULT_TIMEZONE, toLocalDayString } from "@workspace/shared/date";

interface ExtendSubscriptionModalProps {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly currentPeriodEnd: string | Date;
  readonly onConfirm: (newDate: string) => Promise<void> | void;
  readonly isLoading?: boolean;
}

function formatDate(date: string | Date) {
  return new Date(date).toLocaleDateString("es-ES", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

export function ExtendSubscriptionModal({
  open,
  onOpenChange,
  currentPeriodEnd,
  onConfirm,
  isLoading = false,
}: ExtendSubscriptionModalProps) {
  const [newDate, setNewDate] = React.useState("");

  React.useEffect(() => {
    if (!open) return;
    const initial = new Date(currentPeriodEnd);
    setNewDate(toLocalDayString(DEFAULT_TIMEZONE, addDuration(initial, 1, "month", DEFAULT_TIMEZONE)));
  }, [open, currentPeriodEnd]);

  const handleConfirm = async () => {
    if (!newDate) return;
    await onConfirm(newDate);
  };

  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      trigger={null}
      title="Extender Periodo"
      description={`Vence actualmente: ${formatDate(currentPeriodEnd)}`}
    >
      <div className="space-y-4">
        <Input
          type="date"
          label="Nueva fecha de vencimiento"
          value={newDate}
          onChange={(e) => setNewDate(e.target.value)}
        />
        <div className="flex justify-end gap-2">
          <Button variant="outlined" onClick={() => onOpenChange(false)} disabled={isLoading}>
            Volver
          </Button>
          <Button onClick={handleConfirm} disabled={isLoading || !newDate}>
            {isLoading ? "Extendiendo..." : "Confirmar Extensión"}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
