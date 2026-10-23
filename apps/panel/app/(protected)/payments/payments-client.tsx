"use client";

import * as React from "react";
import { Plus, X } from "lucide-react";
import { Button, toast, FloatingActionButton, ReasonPromptModal } from "@workspace/ui/components";
import { useRouter } from "next/navigation";
import {
  SubscriptionsTable,
  type PaymentStatusDecision,
  type PaymentVoidIntent,
} from "@/components/payments/subscriptions-table";
import { SubscriptionModal } from "@/components/payments/subscription-modal";
import { PendingPaymentsList } from "@/components/payments/pending-payments-list";
import { DashboardHeader } from "@/components/dashboard/dashboard-header";
import { FilterPanel } from "@/components/dashboard/filter-panel";
import { KpiSection } from "@/components/payments/kpi-section";
import { RevenueChart } from "@/components/payments/revenue-chart";
import { PaymentMethodsChart } from "@/components/payments/payment-methods-chart";
import { KpiSectionSkeleton, RevenueChartSkeleton } from "@/components/payments/dashboard-skeletons";
import { useDebounce } from "@workspace/ui/hooks/use-debounce";
import {
  API_ERROR_CODES,
  PAYMENT_STATUSES,
  SUBSCRIPTION_STATUSES,
  type SubscriptionStatus,
  type CurrencyFormat,
  apiCode,
  mutationError,
} from "@workspace/shared";
import { cn } from "@workspace/ui/lib/utils";
import { useOrgAuth } from "@workspace/auth/org";
import { resolveOrgCurrencyFormat } from "@/lib/org-config";
import { GLOBAL_FAB_ITEMS } from "@/lib/constants/fab-items";
import { subscriptionsService } from "@/lib/services/subscriptions-service";
import { financeService } from "@/lib/services/finance-service";
import { monthCollectedTotal, perActiveSubscription } from "@/lib/payments/payment-selectors";

import type { ISubscription, PaginatedSubscriptions } from "@workspace/shared/types";

interface PaymentsClientProps {
  readonly initialSubscriptions: PaginatedSubscriptions;
  readonly initialPage: number;
  readonly initialTotalPages: number;
  readonly initialTotal: number;
  readonly initialQuery: string;
  readonly initialStatus: string | null;
  readonly initialPending: ISubscription[];
  readonly initialAnalytics: Awaited<ReturnType<typeof financeService.getAnalytics>> | null;
  readonly initialMonthlyReport: Array<{
    month: string;
    currency: string;
    amount: number;
    normalizedAmount: number;
    unconvertedAmount: number;
    unconvertedCount: number;
    originalExchangeRate: string | null;
  }>;
  readonly initialCurrencyFormat: CurrencyFormat;
  readonly initialPrimaryCurrency: string;
  readonly limit: number;
  readonly onSuccess?: () => Promise<void> | void;
}

/**
 * Resolves a user-friendly error message for payment status updates based on API error codes.
 */
function resolvePaymentErrorMessage(
  err: unknown,
  context: string,
  defaultMessage: string,
): string {
  const code = apiCode(err);
  if (code === "PAYMENT_NOT_REVALIDATABLE") {
    return "Solo un pago en proceso puede validarse";
  }
  if (code === "SUBSCRIPTION_CANCELLED") {
    return "La suscripción está cancelada: no se puede validar este cobro";
  }
  if (code === API_ERROR_CODES.VOID_REASON_REQUIRED) {
    return "Indica el motivo de la anulación";
  }
  return mutationError(context, err, defaultMessage);
}

/**
 * RD-163: an annulment/rejection always carries a non-blank reason. The server
 * rejects a `voided` without it (`400 VOID_REASON_REQUIRED`); the UI stops it
 * before the request so the operator does not lose the action.
 */
function normalizedVoidReason(
  status: string,
  voidReason: string | undefined,
): string | null {
  if (status !== PAYMENT_STATUSES.VOIDED) return null;
  const reason = voidReason?.trim();
  return reason ? reason : null;
}

/**
 * Copy of the mandatory-reason prompt per void intent. The field starts empty
 * on purpose: a prefilled sentence would only move the old server default to
 * the client.
 */
const VOID_REASON_PROMPT = {
  reject: {
    title: "Rechazar pago",
    description:
      "El cobro quedará anulado y la suscripción ANULADA. Escribe el motivo: queda en la auditoría del comprobante.",
    placeholder: "Ej.: el comprobante no coincide con el monto cobrado",
    confirmText: "Rechazar",
  },
  void: {
    title: "Anular cobro",
    description:
      "El cobro se anula y su comprobante conserva el número. Escribe el motivo: queda en la auditoría.",
    placeholder: "Ej.: cobro duplicado, se registró dos veces el mismo pago",
    confirmText: "Anular",
  },
} as const;

/** A void waiting for the operator's mandatory reason. */
interface VoidRequest {
  readonly paymentId: number;
  readonly intent: PaymentVoidIntent;
}

export function PaymentsClient({
  initialSubscriptions,
  initialPage,
  initialTotalPages,
  initialTotal,
  initialQuery,
  initialStatus,
  initialPending,
  initialAnalytics,
  initialMonthlyReport,
  initialCurrencyFormat,
  initialPrimaryCurrency,
  limit,
  onSuccess,
}: PaymentsClientProps) {
  const router = useRouter();
  const { activeOrganization } = useOrgAuth();
  // No delete action: a payment record is voided or revoked, never deleted.
  const primaryCurrency =
    activeOrganization?.primaryCurrency || initialPrimaryCurrency;
  // Session value first; `initialCurrencyFormat` is the SSR value resolved from
  // the same organization (no invented "latam").
  const currencyFormat =
    resolveOrgCurrencyFormat(activeOrganization) ?? initialCurrencyFormat;

  const [searchTerm, setSearchTerm] = React.useState(initialQuery);
  const [activeFilter, setActiveFilter] = React.useState<string | null>(initialStatus);
  const [isNewPaymentModalOpen, setIsNewPaymentModalOpen] = React.useState(false);
  const debouncedSearch = useDebounce(searchTerm, 500);
  const [analytics, setAnalytics] = React.useState(initialAnalytics);
  const [analyticsLoading, setAnalyticsLoading] = React.useState(false);
  const [pendingActionId, setPendingActionId] = React.useState<number | null>(null);
  const [voidRequest, setVoidRequest] = React.useState<VoidRequest | null>(null);
  const [voidSubmitting, setVoidSubmitting] = React.useState(false);

  // P2: only readily available inputs (latest bucket + active subs from KPI).
  const monthCollectedCents = React.useMemo(
    () => monthCollectedTotal(initialMonthlyReport),
    [initialMonthlyReport],
  );
  const perSubscriptionCents = React.useMemo(
    () => perActiveSubscription(monthCollectedCents, analytics?.kpis.activeSubscriptions ?? 0),
    [monthCollectedCents, analytics?.kpis.activeSubscriptions],
  );

  React.useEffect(() => {
    if (debouncedSearch === initialQuery) return;
    const params = new URLSearchParams();
    if (debouncedSearch) params.set("search", debouncedSearch);
    if (activeFilter) params.set("status", activeFilter);
    params.set("page", "1");
    router.push(`/payments?${params.toString()}`);
  }, [debouncedSearch, initialQuery, router, activeFilter]);

  const setFilterAndNavigate = (filter: string | null) => {
    setActiveFilter(filter);
    const params = new URLSearchParams();
    if (initialQuery) params.set("search", initialQuery);
    if (filter) params.set("status", filter);
    params.set("page", "1");
    router.push(`/payments?${params.toString()}`);
  };

  const navigatePage = (newPage: number) => {
    const params = new URLSearchParams();
    if (initialQuery) params.set("search", initialQuery);
    if (activeFilter) params.set("status", activeFilter);
    params.set("page", String(newPage));
    router.push(`/payments?${params.toString()}`);
  };

  const refreshAll = React.useCallback(async () => {
    await onSuccess?.();
    router.refresh();
    if (primaryCurrency) {
      setAnalyticsLoading(true);
      try {
        const fresh = await financeService.getAnalytics();
        setAnalytics(fresh);
      } catch {
        // ignore analytics refresh errors
      } finally {
        setAnalyticsLoading(false);
      }
    }
  }, [router, primaryCurrency, onSuccess]);

  const handleStatusChange = async (id: number, status: string) => {
    try {
      await subscriptionsService.updateStatus(id, status as SubscriptionStatus);
      toast.success(
        `Suscripción ${status === SUBSCRIPTION_STATUSES.ACTIVE ? "activada" : "revocada"}.`,
      );
      refreshAll();
    } catch (err) {
      toast.error(mutationError("PaymentsClient", err, "Fallo al cambiar estado"));
    }
  };

  /**
   * Single entry point for a payment decision. A `voided` never carries a
   * default sentence: the operator writes the reason in `ReasonPromptModal`,
   * and the intent (`reject` / `void`) — not the text — drives the copy.
   * Resolves `true` only when the server confirmed the transition.
   */
  const executePaymentStatusChange = async (
    paymentId: number,
    status: PaymentStatusDecision,
    voidReason?: string,
    intent: PaymentVoidIntent = "void",
  ): Promise<boolean> => {
    const reason = normalizedVoidReason(status, voidReason);
    if (status === PAYMENT_STATUSES.VOIDED && !reason) {
      toast.error(
        intent === "reject"
          ? "Indica el motivo del rechazo"
          : "Indica el motivo de la anulación",
      );
      return false;
    }
    setPendingActionId(paymentId);
    try {
      const result = await financeService.updatePaymentStatus(paymentId, status, reason ?? undefined);
      // Voiding a payment without an issued receipt is not an error, nor
      // a generic "success": cashier needs to know that nothing was voided.
      if (status === PAYMENT_STATUSES.VOIDED) {
        const rejected = intent === "reject";
        if (result?.receiptVoided === false) {
          toast.success(
            rejected
              ? "Pago rechazado."
              : "Pago anulado. No tenía comprobante emitido.",
          );
        } else {
          toast.success(rejected ? "Pago rechazado." : "Pago anulado.");
        }
      } else {
        toast.success("Pago validado.");
      }
      refreshAll();
      return true;
    } catch (err) {
      // UX-meaningful codes (never compare raw server error text):
      // the invariant guard validated ⇔ numbered only accepts
      // `processing → validated` and rejects validating on a cancelled sub.
      toast.error(
        resolvePaymentErrorMessage(err, "PaymentsClient", "Error al actualizar pago"),
      );
      return false;
    } finally {
      setPendingActionId(null);
    }
  };

  /** Requests a decision; a void opens the mandatory-reason prompt first. */
  const requestPaymentDecision = (
    paymentId: number,
    status: PaymentStatusDecision,
    intent: PaymentVoidIntent = "void",
  ) => {
    if (status === PAYMENT_STATUSES.VALIDATED) {
      void executePaymentStatusChange(paymentId, status);
      return;
    }
    setVoidRequest({ paymentId, intent });
  };

  const handleVoidConfirm = async (reason: string) => {
    if (!voidRequest) return;
    setVoidSubmitting(true);
    try {
      const succeeded = await executePaymentStatusChange(
        voidRequest.paymentId,
        PAYMENT_STATUSES.VOIDED,
        reason,
        voidRequest.intent,
      );
      // Keep the prompt (and the typed reason) when the server rejects it.
      if (succeeded) setVoidRequest(null);
    } finally {
      setVoidSubmitting(false);
    }
  };

  const voidPrompt = VOID_REASON_PROMPT[voidRequest?.intent ?? "void"];

  let analyticsContent: React.ReactNode = null;
  if (analyticsLoading && !analytics) {
    analyticsContent = (
      <>
        <KpiSectionSkeleton />
        <div className="flex flex-col xl:flex-row gap-4 w-full">
          <RevenueChartSkeleton />
          <RevenueChartSkeleton />
        </div>
      </>
    );
  } else if (analytics) {
    analyticsContent = (
      <>
        <KpiSection
          stats={analytics.kpis}
          activeFilter={activeFilter}
          onFilterChange={setFilterAndNavigate}
          currencyFormat={currencyFormat}
          monthCollectedCents={monthCollectedCents}
          perSubscriptionCents={perSubscriptionCents}
          primaryCurrency={primaryCurrency}
        />
        <div className="flex flex-col xl:flex-row gap-4 w-full">
          <div className="w-full xl:w-1/2">
            <RevenueChart
              data={analytics.chartData}
              monthlyData={initialMonthlyReport}
              baseCurrency={primaryCurrency}
              currencyFormat={currencyFormat}
            />
          </div>
          <div className="w-full xl:w-1/2">
            <PaymentMethodsChart
              data={analytics}
              currencyFormat={currencyFormat}
            />
          </div>
        </div>
      </>
    );
  }

  return (
    <div className="flex flex-col gap-8">
      <DashboardHeader
        title="Suscripciones y Pagos"
        description="Controla las facturas, renovaciones y vinculaciones de usuarios a sus planes."
        iconName="CreditCard"
      >
        <SubscriptionModal
          onSuccess={refreshAll}
          trigger={
            <Button size="sm" rightIcon={<Plus size={18} />}>
              NUEVO PAGO
            </Button>
          }
        />
      </DashboardHeader>

      {/* Analytics Layer */}
      {analyticsContent}

      <div className="flex flex-col gap-4">
        <PendingPaymentsList
          items={initialPending}
          currencyFormat={currencyFormat}
          actionId={pendingActionId}
          onValidate={(paymentId) => requestPaymentDecision(paymentId, PAYMENT_STATUSES.VALIDATED)}
          onReject={(paymentId) => requestPaymentDecision(paymentId, PAYMENT_STATUSES.VOIDED, "reject")}
        />

        <FilterPanel
          searchValue={searchTerm}
          onSearchChange={setSearchTerm}
          searchPlaceholder="Buscar por usuario o nivel de plan..."
          filterOptions={[
            { value: PAYMENT_STATUSES.PROCESSING, label: "Por validar" },
            { value: SUBSCRIPTION_STATUSES.EXPIRING, label: "Por vencer" },
            { value: SUBSCRIPTION_STATUSES.ACTIVE, label: "Activas" },
            { value: SUBSCRIPTION_STATUSES.VOIDED, label: "Anuladas" },
          ]}
          activeFilter={activeFilter}
          onFilterChange={setFilterAndNavigate}
          filterLabel="Filtros"
        >
          <div className="flex items-center gap-2">
            {[
              { id: PAYMENT_STATUSES.PROCESSING, label: "Por validar", className: "text-orange-500 border-orange-500/20 bg-orange-500/5 hover:bg-orange-500/10" },
              { id: SUBSCRIPTION_STATUSES.EXPIRING, label: "Por vencer", className: "text-destructive border-destructive/20 bg-destructive/5 hover:bg-destructive/10" },
              { id: SUBSCRIPTION_STATUSES.ACTIVE, label: "Activas", className: "text-info border-info/20 bg-info/5 hover:bg-info/10" },
              { id: SUBSCRIPTION_STATUSES.VOIDED, label: "Anuladas", className: "text-gray-500 border-gray-500/20 bg-gray-500/5 hover:bg-gray-500/10" },
            ].map((btn) => (
              <Button
                key={btn.id}
                size="sm"
                variant={activeFilter === btn.id ? "primary" : "glass"}
                className={cn(
                  "cursor-pointer font-medium transition-all normal-case tracking-normal border border-transparent",
                  activeFilter === btn.id
                    ? "border-primary"
                    : btn.className
                )}
                onClick={() => setFilterAndNavigate(activeFilter === btn.id ? null : btn.id)}
              >
                {btn.label}
              </Button>
            ))}
            {activeFilter && (
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 rounded-full"
                onClick={() => setFilterAndNavigate(null)}
              >
                <X className="h-4 w-4" />
              </Button>
            )}
          </div>
        </FilterPanel>

        <section>
          <SubscriptionsTable
            subscriptions={initialSubscriptions.data as ISubscription[]}
            onStatusChange={handleStatusChange}
            onPaymentStatusChange={requestPaymentDecision}
            onSuccess={refreshAll}
            loading={false}
            pagination={{
              page: initialPage,
              totalPages: initialTotalPages,
              total: initialTotal,
              limit,
              onPageChange: navigatePage,
            }}
          />
        </section>

        <FloatingActionButton
          config={{
            items: [
              ...GLOBAL_FAB_ITEMS,
              {
                id: "new-payment",
                icon: Plus,
                label: "Nuevo pago",
                onClick: () => setIsNewPaymentModalOpen(true),
              },
            ],
          }}
        />

        <SubscriptionModal
          open={isNewPaymentModalOpen}
          onOpenChange={setIsNewPaymentModalOpen}
          onSuccess={refreshAll}
          trigger={<span />}
        />

        {/* RD-163: the reason is typed by the operator — never a client default. */}
        <ReasonPromptModal
          open={voidRequest !== null}
          onOpenChange={(open) => {
            if (!open) setVoidRequest(null);
          }}
          title={voidPrompt.title}
          description={voidPrompt.description}
          label="Motivo *"
          placeholder={voidPrompt.placeholder}
          confirmText={voidPrompt.confirmText}
          variant="danger"
          isLoading={voidSubmitting}
          onConfirm={handleVoidConfirm}
        />
      </div>
    </div>
  );
}
