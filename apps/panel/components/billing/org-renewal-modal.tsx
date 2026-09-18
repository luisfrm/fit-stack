"use client";

import * as React from "react";
import { Modal, Button, Text, Badge, toast } from "@workspace/ui/components";
import { CalendarClock, RefreshCw, Sparkles } from "lucide-react";
import { useAuth } from "@/lib/hooks/use-auth";
import { OrgPaymentSection } from "./org-payment-section";
import { renewOrgSubscription, type OrgPaymentMethodsResponse, type OrgSubscriptionInfo } from "@/lib/services/org-billing";
import { mutationError } from "@/lib/errors";
import { uploadService } from "@/lib/services/upload-service";
import { getExchangeRates } from "@/lib/api/exchange-rates";
import { toLocalDayString } from "@workspace/shared/date";
import { centsToUnits } from "@workspace/shared";
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
  const [referenceRate, setReferenceRate] = React.useState(1);
  const [referenceAmount, setReferenceAmount] = React.useState(centsToUnits(subscription.planPrice));
  const [isSubmitting, setIsSubmitting] = React.useState(false);

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
      setReferenceRate(1);
      setReferenceAmount(centsToUnits(subscription.planPrice));
      return;
    }
    let cancelled = false;
    getExchangeRates(subscription.planCurrency)
      .then((rates) => {
        if (cancelled) return;
        const rate = rates[paymentCurrency] ?? 0;
        setReferenceRate(rate);
        setReferenceAmount(centsToUnits(subscription.planPrice) * rate);
      })
      .catch(() => {
        if (!cancelled) {
          setReferenceRate(0);
          setReferenceAmount(0);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [paymentCurrency, subscription.planCurrency, subscription.planPrice]);

  const validate = (): boolean => {
    if (!paymentMethodId) {
      toast.error("Selecciona un método de pago");
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
    if (!validate()) return;
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
              activeOrganization.id,
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
        paymentMethod: selectedPaymentConfig?.name || paymentMethodId,
        currencyPaid: paymentCurrency,
        paymentMethodDetails: finalPaymentMethodDetails,
        paymentDate,
      });

      toast.success("Pago enviado — quedará en revisión por el equipo Fit-Stack");
      onOpenChange(false);
      await onRenewed?.();
    } catch (err) {
      // El mensaje del API nunca se muestra al usuario — solo consola.
      toast.error(mutationError("OrgRenewalModal", err, "No se pudo registrar el pago. Intente nuevamente."));
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
          referenceRate={referenceRate}
          referenceAmount={referenceAmount}
          paymentDate={paymentDate}
          onPaymentDateChange={setPaymentDate}
          onCurrencyChange={setPaymentCurrency}
          onMethodChange={setPaymentMethodId}
          disabled={isSubmitting}
        />

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
          <Button variant="primary" onClick={handleSubmit} loading={isSubmitting} disabled={isSubmitting}>
            Enviar Pago
          </Button>
        </div>
      </div>
    </Modal>
  );
}