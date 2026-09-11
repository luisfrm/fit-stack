"use client";

import * as React from "react";
import { Check, X } from "lucide-react";
import { Button } from "@workspace/ui/components";
import { Card } from "@workspace/ui/components/card";
import { Text } from "@workspace/ui/components/text";
import { formatCents, type CurrencyFormat } from "@workspace/shared";
import type { ISubscription } from "@workspace/shared/types";

interface PendingPaymentsListProps {
  readonly items: ISubscription[];
  readonly currencyFormat: CurrencyFormat;
  /** paymentId con acción en curso (deshabilita sus botones). */
  readonly actionId: number | null;
  readonly onValidate: (paymentId: number) => void;
  readonly onReject: (paymentId: number) => void;
}

/**
 * Accionable "Por validar": top-5 suscripciones con pago `processing`
 * con validar/rechazar rápido. Mismo patrón que `actionItems` del dashboard:
 * los datos llegan del RSC, aquí solo se disparan las mutaciones.
 */
export function PendingPaymentsList({
  items,
  currencyFormat,
  actionId,
  onValidate,
  onReject,
}: Readonly<PendingPaymentsListProps>) {
  if (items.length === 0) return null;

  return (
    <section data-testid="pending-payments-section" className="flex flex-col gap-3">
      <Text size="sm" weight="bold" className="uppercase tracking-widest">
        Por validar ({items.length})
      </Text>
      {items.map((sub) => {
        const paymentId = sub.paymentId ?? 0;
        const busy = actionId === paymentId;
        const memberName = [sub.memberName, sub.memberLastName].filter(Boolean).join(" ") || "Miembro";
        return (
          <Card
            key={sub.id}
            data-testid={`pending-payment-${paymentId}`}
            className="flex flex-col sm:flex-row sm:items-center gap-3 p-4"
          >
            <div className="flex-1 min-w-0">
              <Text as="p" size="sm" weight="bold" className="truncate">
                {memberName}
              </Text>
              <Text as="p" size="xs" variant="muted" className="truncate">
                {[sub.planName, sub.paymentMethod].filter(Boolean).join(" · ")}
              </Text>
            </div>
            <Text as="p" size="sm" weight="bold" className="font-mono shrink-0">
              {typeof sub.amountPaid === "number"
                ? formatCents(sub.amountPaid, sub.currencyPaid ?? "", currencyFormat)
                : "—"}
            </Text>
            <div className="flex gap-2 shrink-0">
              <Button
                variant="primary"
                size="sm"
                leftIcon={<Check className="w-4 h-4" />}
                disabled={busy}
                onClick={() => onValidate(paymentId)}
                className="pending-validate"
              >
                Validar
              </Button>
              <Button
                variant="glass"
                size="sm"
                leftIcon={<X className="w-4 h-4" />}
                disabled={busy}
                onClick={() => onReject(paymentId)}
                className="pending-reject"
              >
                Rechazar
              </Button>
            </div>
          </Card>
        );
      })}
    </section>
  );
}
