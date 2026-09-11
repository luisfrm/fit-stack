"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Button, Text, Badge } from "@workspace/ui/components";
import { CalendarClock, Clock3, CreditCard, Hourglass, Info, Sparkles } from "lucide-react";
import { OrgRenewalModal } from "./org-renewal-modal";
import { formatCents } from "@workspace/shared";
import type { OrgPaymentMethodsResponse, OrgSubscriptionInfo } from "@/lib/services/org-billing";

interface SubscriptionStatusCardProps {
  readonly subscription: OrgSubscriptionInfo | null;
  readonly paymentMethods: OrgPaymentMethodsResponse | null;
  readonly isFreeTier: boolean;
  /** true si la sub ya venció (computado server-side). */
  readonly isExpired: boolean;
  /** días hasta vencer (positivo) o desde que venció (negativo). */
  readonly daysDiff: number;
  readonly refreshBilling?: () => Promise<void>;
}

function formatDate(date: string) {
  return new Date(date).toLocaleDateString("es-ES", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function formatAmount(cents: number, currency: string) {
  return formatCents(cents, currency);
}

const PENDING_STATUSES = new Set(["pending", "processing"]);

export function SubscriptionStatusCard({
  subscription,
  paymentMethods,
  isFreeTier,
  isExpired,
  daysDiff,
  refreshBilling,
}: SubscriptionStatusCardProps) {
  const router = useRouter();
  const [isModalOpen, setIsModalOpen] = React.useState(false);

  if (!subscription) {
    return (
      <section className="mt-8 overflow-hidden rounded-xl border border-border bg-surface">
        <div className="flex items-center justify-between gap-3 border-b border-border-muted bg-surface-2/40 px-4 py-3">
          <div className="flex items-center gap-2.5 min-w-0">
            <CreditCard className="size-4 text-primary shrink-0" />
            <span className="text-sm font-bold tracking-tight">Suscripción SaaS</span>
          </div>
          {isFreeTier && <Badge variant="info" size="sm" className="uppercase tracking-widest">Free Tier</Badge>}
        </div>
        <div className="p-4 flex items-start gap-2.5">
          <Info className="size-4 text-foreground-dim shrink-0 mt-0.5" />
          <Text size="sm" variant="muted" className="leading-relaxed">
            Sin suscripción activa. {isFreeTier ? "Operas en el piso gratuito de la plataforma." : "Contacta al equipo Fit-Stack para contratar un plan."}
          </Text>
        </div>
      </section>
    );
  }

  const isCancelled = Boolean(subscription.cancelledAt);
  const hasPending = PENDING_STATUSES.has(subscription.latestPaymentStatus ?? "");
  const canRenew = isExpired && !isCancelled && !hasPending;

  const handleRenewed = async () => {
    await refreshBilling?.();
    router.refresh();
  };

  return (
    <>
      <section className="mt-8 overflow-hidden rounded-xl border border-border bg-surface">
        <div className="flex items-center justify-between gap-3 border-b border-border-muted bg-surface-2/40 px-4 py-3">
          <div className="flex items-center gap-2.5 min-w-0">
            <CreditCard className="size-4 text-primary shrink-0" />
            <span className="text-sm font-bold tracking-tight truncate">Suscripción SaaS</span>
            <span className="hidden sm:inline text-[11px] text-foreground-muted truncate">
              · {subscription.planName}
            </span>
          </div>
          <Badge
            variant={
              isCancelled ? "destructive" : isExpired ? "destructive" : hasPending ? "warning" : "success"
            }
            size="sm"
            className="uppercase tracking-widest"
          >
            {isCancelled ? "Cancelada" : isExpired ? "Expirada" : hasPending ? "En revisión" : subscription.status}
          </Badge>
        </div>

        <div className="divide-y divide-border-muted">
          <div className="flex items-center justify-between gap-3 px-4 py-3">
            <div className="flex items-center gap-3 min-w-0">
              <Sparkles className="size-3.5 text-primary shrink-0" />
              <div className="flex flex-col min-w-0">
                <span className="text-[13px] font-bold tracking-wide text-foreground truncate">{subscription.planName}</span>
                <span className="text-xs text-foreground-muted truncate">
                  {formatAmount(subscription.planPrice, subscription.planCurrency)} · {subscription.planDurationValue} {subscription.planDurationUnit}(s)
                </span>
              </div>
            </div>
            <span className="text-xs text-foreground-muted hidden sm:block">
              Desde {formatDate(subscription.startDate)}
            </span>
          </div>

          <div className="flex items-center justify-between gap-3 px-4 py-3">
            <div className="flex items-center gap-3 min-w-0">
              <CalendarClock className={`size-3.5 shrink-0 ${isExpired ? "text-destructive/80" : "text-primary"}`} />
              <div className="flex flex-col min-w-0">
                <span className="text-[13px] font-bold tracking-wide">Vence: {formatDate(subscription.currentPeriodEnd)}</span>
                <span className={`text-xs ${isExpired ? "text-destructive/80" : "text-foreground-muted"}`}>
                  {isExpired
                    ? `Expirada hace ${Math.abs(daysDiff)} día(s)`
                    : `Vence en ${daysDiff} día(s)`}
                </span>
              </div>
            </div>
            {canRenew && (
              <Button size="sm" variant="primary" onClick={() => setIsModalOpen(true)}>
                Renovar
              </Button>
            )}
          </div>

          {hasPending && (
            <div className="flex items-center gap-2.5 px-4 py-3 bg-amber-500/5">
              <Hourglass className="size-4 text-amber-500 shrink-0" />
              <Text size="xs" className="text-amber-600/90 leading-relaxed">
                Tienes un pago <Badge variant="warning" size="sm" className="uppercase">en revisión</Badge>. El equipo Fit-Stack lo verificará y, al aprobarlo, tu suscripción se renovará automáticamente.
              </Text>
            </div>
          )}

          {isCancelled && (
            <div className="flex items-center gap-2.5 px-4 py-3 bg-destructive/5">
              <Clock3 className="size-4 text-destructive/80 shrink-0" />
              <Text size="xs" className="text-destructive/80 leading-relaxed">
                Esta suscripción fue cancelada. Contacta al equipo Fit-Stack para reactivarla.
              </Text>
            </div>
          )}
        </div>
      </section>

      <OrgRenewalModal
        open={isModalOpen}
        onOpenChange={setIsModalOpen}
        subscription={subscription}
        paymentMethods={paymentMethods}
        onRenewed={handleRenewed}
      />
    </>
  );
}