"use client";

import * as React from "react";
import { Modal, Button, Text, Badge, toast } from "@workspace/ui/components";
import { CalendarClock, RefreshCw, Sparkles } from "lucide-react";
import { useAuth } from "@workspace/auth/hooks";
import { OrgPaymentSection } from "./org-payment-section";
import { renewOrgSubscription, type OrgPaymentMethodsResponse, type OrgSubscriptionInfo } from "@/lib/services/org-billing";
import {
  apiCode,
  mutationError,
  paymentConversionView,
  type ExchangeRateLoadStatus,
  type ExchangeRateSnapshot,
} from "@workspace/shared";
import { uploadService } from "@/lib/services/upload-service";
import { getExchangeRateSnapshot } from "@/lib/api/exchange-rates";
import { toLocalDayString } from "@workspace/shared/date";

import type { IPaymentMethodDetails } from "@workspace/shared/types";

interface OrgRenewalModalProps {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly subscription: OrgSubscriptionInfo;
  readonly paymentMethods: OrgPaymentMethodsResponse | null;
  readonly onRenewed?: () => void | Promise<void>;
}

function formatDate(date: string) {
  return new Date(date).toLocaleDateString("es-ES", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

export function OrgRenewalModal({
  open,
  onOpenChange,
  subscription,
  paymentMethods,
  onRenewed,
}: OrgRenewalModalProps) {
  const { activeOrganization } = useAuth();
  const [paymentCurrency, setPaymentCurrency] = React.useState(subscription.planCurrency);
  const [paymentMethodId, setPaymentMethodId] = React.useState("");
  const [dynamicFieldValues, setDynamicFieldValues] = React.useState<Record<string, any>>({});
  const [paymentDate, setPaymentDate] = React.useState(() => toLocalDayString(activeOrganization?.timezone));
  const [rateSnapshot, setRateSnapshot] = React.useState<ExchangeRateSnapshot | null>(null);
  const [rateStatus, setRateStatus] = React.useState<ExchangeRateLoadStatus>('idle');
  const [rateReloadToken, setRateReloadToken] = React.useState(0);
  const [isSubmitting, setIsSubmitting] = React.useState(false);

  // Required configuration (NOT NULL since creation): a missing value is a
  // data problem, so it is surfaced as a visible error — never defaulted.
  const currencyFormat = activeOrganization?.currencyFormat;

  const activeCurrencies = paymentMethods?.activeCurrencies ?? [subscription.planCurrency];
  const activePaymentMethods = React.useMemo(
    () =>
      (paymentMethods?.activePaymentMethods ?? []).filter(
        (m) => m.currency === null || m.currency === paymentCurrency,
      ),
    [paymentMethods, paymentCurrency],
  );
  const selectedPaymentConfig = React.useMemo(
    () => activePaymentMethods.find((m) => m.id === paymentMethodId),
    [activePaymentMethods, paymentMethodId],
  );

  React.useEffect(() => {
    setPaymentMethodId("");
  }, [paymentCurrency]);

  React.useEffect(() => {
    if (paymentCurrency === subscription.planCurrency) {
      setRateSnapshot(null);
      setRateStatus('ready');
      return;
    }

    let cancelled = false;
    setRateSnapshot(null);
    setRateStatus('loading');

    getExchangeRateSnapshot(subscription.planCurrency)
      .then((snapshot) => {
        if (cancelled) return;
        setRateSnapshot(snapshot);
        const rate = snapshot.rates[paymentCurrency];
        const isValidRate =
          typeof rate === 'number' && Number.isFinite(rate) && rate > 0;
        // Missing currency in the response: never assume a rate.
        setRateStatus(isValidRate ? 'ready' : 'error');
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        console.error('Error fetching exchange rates for org renewal', error);
        setRateStatus('error');
      });

    return () => {
      cancelled = true;
    };
  }, [paymentCurrency, subscription.planCurrency, rateReloadToken]);

  const conversion = React.useMemo(
    () =>
      paymentConversionView(
        subscription.planCurrency,
        paymentCurrency,
        rateSnapshot,
        rateStatus,
      ),
    [subscription.planCurrency, paymentCurrency, rateSnapshot, rateStatus],
  );

  const validate = (): boolean => {
    if (!currencyFormat) {
      toast.error("La organización no tiene un formato de moneda configurado. Contacta a soporte.");
      return false;
    }
    if (paymentCurrency !== subscription.planCurrency && !conversion.canSubmit) {
      toast.error("La tasa de cambio aún no está disponible. El pago está bloqueado hasta que cargue.");
      return false;
    }
    if (!paymentMethodId) {
      toast.error("Selecciona un método de pago");
      return false;
    }
    if (!selectedPaymentConfig) {
      toast.error("El método de pago seleccionado ya no está disponible. Recarga la página.");
      return false;
    }
    if (!paymentDate) {
      toast.error("Selecciona la fecha de operación");
      return false;
    }
    if (selectedPaymentConfig) {
      for (const field of selectedPaymentConfig.fields) {
        if (field.type === "visual") continue;
        const value = dynamicFieldValues[field.id];
        const isEmpty =
          value === undefined || value === null || (typeof value === "string" && value.trim() === "");
        if (field.required && isEmpty) {
          toast.error(`El campo "${field.label}" es obligatorio`);
          return false;
        }
      }
    }
    return true;
  };

  const handleSubmit = async () => {
    if (!validate() || !selectedPaymentConfig) return;
    if (!activeOrganization) {
      toast.error("No se pudo determinar la organización activa");
      return;
    }

    setIsSubmitting(true);
    try {
      // Subir capturas pendientes (file fields) a R2
      const finalDetails: Record<string, any> = { ...dynamicFieldValues };
      if (selectedPaymentConfig) {
        for (const field of selectedPaymentConfig.fields) {
          if (field.type !== "file") continue;
          const pending = dynamicFieldValues[field.id];
          if (pending instanceof File) {
            const timestamp = Date.now().toString().slice(-6);
            const orgName = (activeOrganization.name ?? "org").toLowerCase().replaceAll(/\s+/g, "-");
            const methodName = selectedPaymentConfig.name.toLowerCase().replaceAll(/\s+/g, "-");
            const customName = `${orgName}_${methodName}_${timestamp}`;
            finalDetails[field.id] = await uploadService.uploadFile(
              pending,
              customName,
              "receipts",
            );
          }
        }
      }

      let finalPaymentMethodDetails: IPaymentMethodDetails | undefined;
      if (selectedPaymentConfig && Object.keys(finalDetails).length > 0) {
        finalPaymentMethodDetails = selectedPaymentConfig.fields
          .filter((field) => field.type !== "visual" && finalDetails[field.id] !== undefined)
          .map((field) => ({
            label: field.label,
            value: finalDetails[field.id],
            type: field.type === "visual" ? "text" : field.type,
          }));
      }

      await renewOrgSubscription({
        paymentMethod: selectedPaymentConfig.name,
        currencyPaid: paymentCurrency,
        paymentMethodDetails: finalPaymentMethodDetails,
        paymentDate,
      });

      toast.success("Pago enviado — quedará en revisión por el equipo Fit-Stack");
      onOpenChange(false);
      await onRenewed?.();
    } catch (err) {
      // The API message is never shown directly to the user — console only.
      // UX-meaningful failures are resolved by business CODE, never by text.
      const code = apiCode(err);
      const fallback =
        code === "EXCHANGE_RATE_UNAVAILABLE"
          ? "El servicio de tasas de cambio no está disponible. Intenta de nuevo en unos minutos."
          : code === "PAYMENT_CURRENCY_UNSUPPORTED"
            ? "La moneda de pago seleccionada no está soportada por el proveedor de tasas."
            : "No se pudo registrar el pago. Intente nuevamente.";
      toast.error(mutationError("OrgRenewalModal", err, fallback));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Modal
      open={open}
      onOpenChange={(val) => !val && onOpenChange(false)}
      trigger={null}
      title="Renovar Suscripción"
      description={`${subscription.planName} · vence ${formatDate(subscription.currentPeriodEnd)}`}
      size="lg"
      isScrollable
    >
      <div className="space-y-6">
        <div className="grid grid-cols-2 gap-4">
          <div className="p-4 rounded-xl border border-border bg-foreground/3 space-y-1">
            <Text size="xs" variant="muted" uppercase className="font-bold tracking-wider">Plan</Text>
            <div className="flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-primary" />
              <Text weight="bold">{subscription.planName}</Text>
            </div>
          </div>
          <div className="p-4 rounded-xl border border-border bg-foreground/3 space-y-1">
            <Text size="xs" variant="muted" uppercase className="font-bold tracking-wider">Vencimiento</Text>
            <div className="flex items-center gap-2">
              <CalendarClock className="w-4 h-4 text-destructive/80" />
              <Text weight="bold" className="text-destructive/80">{formatDate(subscription.currentPeriodEnd)}</Text>
            </div>
          </div>
        </div>

        {currencyFormat ? (
          <OrgPaymentSection
            planName={subscription.planName}
            planPriceCents={subscription.planPrice}
            planCurrency={subscription.planCurrency}
            paymentCurrency={paymentCurrency}
            paymentMethodId={paymentMethodId}
            activeCurrencies={activeCurrencies}
            activePaymentMethods={activePaymentMethods}
            selectedPaymentConfig={selectedPaymentConfig}
            dynamicFieldValues={dynamicFieldValues}
            onDynamicChange={(id, value) => setDynamicFieldValues((prev) => ({ ...prev, [id]: value }))}
            conversion={conversion}
            rateStatus={rateStatus}
            onRetryRate={() => setRateReloadToken((value) => value + 1)}
            currencyFormat={currencyFormat}
            paymentDate={paymentDate}
            onPaymentDateChange={setPaymentDate}
            onCurrencyChange={setPaymentCurrency}
            onMethodChange={setPaymentMethodId}
            disabled={isSubmitting}
          />
        ) : (
          <div className="p-4 rounded-xl border border-destructive/30 bg-destructive/5">
            <Text size="xs" className="text-destructive/90 leading-relaxed">
              No se pudo cargar la configuración de moneda de la organización. Contacta a soporte.
            </Text>
          </div>
        )}

        <div className="flex items-center justify-between p-3 rounded-xl border border-amber-500/20 bg-amber-500/5">
          <div className="flex items-center gap-2">
            <RefreshCw className="w-4 h-4 text-amber-500" />
            <Text size="xs" className="text-amber-600/90 leading-relaxed">
              Al enviar, el pago queda <Badge variant="warning" size="sm" className="uppercase">en revisión</Badge> hasta que el equipo Fit-Stack lo apruebe.
            </Text>
          </div>
        </div>

        <div className="flex justify-end gap-3 pt-4 border-t border-border">
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={isSubmitting}>
            Cancelar
          </Button>
          <Button
            variant="primary"
            onClick={handleSubmit}
            loading={isSubmitting}
            disabled={isSubmitting || !conversion.canSubmit || !currencyFormat}
          >
            Enviar Pago
          </Button>
        </div>
      </div>
    </Modal>
  );
}