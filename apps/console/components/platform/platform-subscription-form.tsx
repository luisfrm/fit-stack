"use client";

import * as React from "react";
import {
  Input,
  Button,
  toast,
} from "@workspace/ui/components";
import {
  type IPlatformOrganization,
  type IPlatformPlan,
  type IPaymentMethodConfig,
  type IPaymentMethodDetail,
  type PaymentStatus,
} from "@workspace/shared/types";
import { PAYMENT_STATUSES } from "@workspace/shared/constants";
import { uploadService } from "@/lib/services/upload-service";
import { organizationsService } from "@/lib/services/organizations-service";
import { platformPlansService } from "@/lib/services/platform-plans-service";
import { useDebounce } from "@/lib/hooks/use-debounce";
import { PLATFORM_SETTINGS_KEYS } from "@/lib/config/platform-settings";
import { useExchangeRates } from "@/lib/hooks/use-exchange-rates";
import { type CurrencyFormat } from "@/lib/utils/value-converters";
import { OrganizationSelector } from "./organization-selector";
import { PaymentSection } from "./payment-section";
import { PlatformPlanSelector } from "./platform-plan-selector";

interface PaymentData {
  amountPaidCents: number;
  currencyPaid: string;
  exchangeRateApplied?: string;
  baseAmountCents?: number;
  paymentMethod: string;
  paymentMethodDetails?: IPaymentMethodDetail[] | Record<string, any>;
  status: PaymentStatus;
  paymentDate?: string;
}

interface PlatformSubscriptionSubmitData {
  organizationId: string;
  planId: number;
  startDate: string;
  isTrial: boolean;
  priceOverrideCents?: number;
  payment: PaymentData;
}

interface PlatformSubscriptionFormProps {
  readonly onSubmit: (data: PlatformSubscriptionSubmitData) => Promise<void>;
  readonly isLoading?: boolean;
  readonly initialOrganization?: IPlatformOrganization | null;
  readonly settings?: Record<string, string>;
}

function calculateEndDate(
  startDate: string,
  durationValue: number,
  durationUnit: "day" | "week" | "month" | "year"
): string {
  const parts = startDate.split("-").map(Number);
  const year = parts[0];
  const month = parts[1];
  const day = parts[2];
  if (year === undefined || month === undefined || day === undefined || Number.isNaN(year) || Number.isNaN(month) || Number.isNaN(day)) {
    return "";
  }

  // Construct local date without UTC offset drift
  const d = new Date(year, month - 1, day);
  switch (durationUnit) {
    case "day":
      d.setDate(d.getDate() + durationValue);
      break;
    case "week":
      d.setDate(d.getDate() + durationValue * 7);
      break;
    case "month":
      d.setMonth(d.getMonth() + durationValue);
      break;
    case "year":
      d.setFullYear(d.getFullYear() + durationValue);
      break;
  }
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function PlatformSubscriptionForm({
  onSubmit,
  isLoading,
  initialOrganization,
  settings
}: PlatformSubscriptionFormProps) {
  const platformSettings = React.useMemo(() => settings ?? {}, [settings]);
  const [plans, setPlans] = React.useState<IPlatformPlan[]>([]);

  const [selectedOrganization, setSelectedOrganization] = React.useState<IPlatformOrganization | null>(
    initialOrganization ?? null
  );

  React.useEffect(() => {
    if (initialOrganization) {
      setSelectedOrganization(initialOrganization);
    }
  }, [initialOrganization]);

  const organizationId = selectedOrganization?.id ?? null;
  const [planId, setPlanId] = React.useState<number | null>(null);

  const [orgSearch, setOrgSearch] = React.useState("");
  const debouncedOrgSearch = useDebounce(orgSearch, 500);
  const [orgResults, setOrgResults] = React.useState<IPlatformOrganization[]>([]);
  const [isSearchingOrg, setIsSearchingOrg] = React.useState(false);

  const d = new Date();
  const todayStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

  const [startDate, setStartDate] = React.useState(todayStr);
  const [isTrial, setIsTrial] = React.useState(false);
  const [paymentDate, setPaymentDate] = React.useState(todayStr);

  const [paymentCurrency, setPaymentCurrency] = React.useState("USD");
  const [exchangeRate, setExchangeRate] = React.useState(1);
  const [finalAmount, setFinalAmount] = React.useState(0);
  const [paymentMethodId, setPaymentMethodId] = React.useState("");
  const [paymentDetails, setPaymentDetails] = React.useState("");
  const [dynamicFieldValues, setDynamicFieldValues] = React.useState<Record<string, any>>({});
  const [allowPriceOverride, setAllowPriceOverride] = React.useState(false);
  const [isProcessingUploads, setIsProcessingUploads] = React.useState(false);
  const [paymentValidated, setPaymentValidated] = React.useState(true);

  const [amountFocus, setAmountFocus] = React.useState(false);
  const [rateFocus, setRateFocus] = React.useState(false);

  const currencyFormat = (platformSettings[PLATFORM_SETTINGS_KEYS.CURRENCY_FORMAT] as CurrencyFormat) || "latam";

  const selectedPlan = React.useMemo(() => plans.find((p) => p.id === planId) ?? null, [plans, planId]);

  // Plan free (precio 0) o trial explícito
  const isFreePlan = selectedPlan ? Number(selectedPlan.price) === 0 : false;
  const hasTrialDays = selectedPlan ? (selectedPlan.trialDays ?? 0) > 0 : false;
  const showPayment = selectedPlan && !isTrial && !isFreePlan;

  // Preview de la fecha de fin (solo visual)
  const previewEndDate = React.useMemo(() => {
    if (!selectedPlan) return "";
    if (isTrial && hasTrialDays) {
      return calculateEndDate(startDate, selectedPlan.trialDays!, "day");
    }
    return calculateEndDate(
      startDate,
      selectedPlan.durationValue,
      selectedPlan.durationUnit
    );
  }, [selectedPlan, startDate, isTrial, hasTrialDays]);

  const planCurrency = selectedPlan?.currency || "USD";
  const { data: planRates } = useExchangeRates(planCurrency);

  const isForced = initialOrganization !== undefined && initialOrganization !== null;

  const loadPlans = React.useCallback(async () => {
    try {
      const data = await platformPlansService.getAll();
      setPlans(data.filter((p) => p.isActive));
    } catch {
      toast.error("Error al cargar los planes");
    }
  }, []);

  React.useEffect(() => { loadPlans(); }, [loadPlans]);

  React.useEffect(() => {
    setAllowPriceOverride(platformSettings["allow_price_override"] === "true");
  }, [platformSettings]);

  React.useEffect(() => {
    if (!debouncedOrgSearch) { setOrgResults([]); return; }
    let cancelled = false;
    const search = async () => {
      setIsSearchingOrg(true);
      try {
        const res = await organizationsService.getAll({ query: debouncedOrgSearch, limit: 5 });
        if (!cancelled) setOrgResults(res.data);
      } catch { if (!cancelled) setOrgResults([]); }
      finally { if (!cancelled) setIsSearchingOrg(false); }
    };
    search();
    return () => { cancelled = true; };
  }, [debouncedOrgSearch]);

  const activeCurrencies = React.useMemo(() => {
    const val = platformSettings[PLATFORM_SETTINGS_KEYS.ACTIVE_CURRENCIES];
    if (!val) return ["USD", "VES"];
    try { return JSON.parse(val) as string[]; } catch { return ["USD"]; }
  }, [platformSettings]);

  const activePaymentMethods = React.useMemo(() => {
    const val = platformSettings[PLATFORM_SETTINGS_KEYS.ACTIVE_PAYMENT_METHODS];
    if (!val) return [];
    try { return JSON.parse(val) as IPaymentMethodConfig[]; } catch { return []; }
  }, [platformSettings]);

  const selectedPaymentConfig = React.useMemo(
    () => activePaymentMethods.find((m) => m.id === paymentMethodId),
    [activePaymentMethods, paymentMethodId]
  );

  const filteredPaymentMethods = React.useMemo(() => {
    return activePaymentMethods.filter((m) => m.currency === null || m.currency === paymentCurrency);
  }, [activePaymentMethods, paymentCurrency]);

  React.useEffect(() => {
    if (!selectedPlan) { setFinalAmount(0); setExchangeRate(1); return; }
    let rate = 1;
    if (paymentCurrency !== selectedPlan.currency && planRates) {
      rate = planRates[paymentCurrency] ?? 1;
    }
    setExchangeRate(rate);
    // price ya está en centavos → dividir por 100 para mostrar
    setFinalAmount((Number(selectedPlan.price) * rate) / 100);
  }, [selectedPlan, paymentCurrency, planRates]);

  const handleSelectOrg = (org: IPlatformOrganization) => {
    setSelectedOrganization(org);
    setOrgSearch("");
    setOrgResults([]);
  };

  const handleClearOrg = () => {
    setSelectedOrganization(null);
    setOrgSearch("");
  };

  const handleCurrencyChange = (value: string) => {
    setPaymentCurrency(value);
    setPaymentMethodId("");
  };

  const handleUploads = async () => {
    const finalDetails: Record<string, any> = { ...dynamicFieldValues };
    if (!selectedPaymentConfig) return finalDetails;
    for (const field of selectedPaymentConfig.fields) {
      const isFilePending = field.type === "file" && dynamicFieldValues[field.id] instanceof File;
      if (isFilePending) {
        const file = dynamicFieldValues[field.id] as File;
        const timestamp = Date.now().toString().slice(-6);
        const orgName = selectedOrganization?.name.toLowerCase().replaceAll(/\s+/g, "-") || "org";
        const methodName = selectedPaymentConfig.name.toLowerCase().replaceAll(/\s+/g, "-");
        const customName = `${orgName}_${methodName}_${timestamp}`;
        finalDetails[field.id] = await uploadService.uploadFile(file, customName, organizationId || undefined, "receipts");
      }
    }
    return finalDetails;
  };

  const handleSubmit = async (e: React.SubmitEvent) => {
    e.preventDefault();
    if (!organizationId) { toast.error("Debes seleccionar una organización"); return; }
    if (!planId) { toast.error("Debes seleccionar un plan"); return; }

    setIsProcessingUploads(true);
    try {
      // Trial o plan free: pago automático validated con 0
      if (isTrial || isFreePlan) {
        await onSubmit({
          organizationId,
          planId,
          startDate,
          isTrial: isTrial,
          payment: {
            amountPaidCents: 0,
            currencyPaid: planCurrency,
            paymentMethod: isTrial ? "trial" : "free",
            status: PAYMENT_STATUSES.VALIDATED,
            paymentDate: todayStr,
          },
        });
        return;
      }

      const finalDetails = await handleUploads();

      let finalPaymentMethodDetails: IPaymentMethodDetail[] | Record<string, any> | undefined;
      if (selectedPaymentConfig && Object.keys(finalDetails).length > 0) {
        finalPaymentMethodDetails = selectedPaymentConfig.fields
          .filter((field) => finalDetails[field.id] !== undefined)
          .map((field) => ({
            label: field.label,
            value: finalDetails[field.id],
            type: field.type,
          }));
      } else if (paymentDetails) {
        finalPaymentMethodDetails = [{ label: "Nota / Referencia", value: paymentDetails, type: "text" }];
      }

      await onSubmit({
        organizationId,
        planId,
        startDate,
        isTrial: false,
        payment: {
          amountPaidCents: Math.round(finalAmount * 100),
          currencyPaid: paymentCurrency,
          exchangeRateApplied: exchangeRate === 1 ? undefined : String(exchangeRate),
          paymentMethod: selectedPaymentConfig?.name || paymentMethodId,
          paymentMethodDetails: finalPaymentMethodDetails,
          status: paymentValidated ? PAYMENT_STATUSES.VALIDATED : PAYMENT_STATUSES.PROCESSING,
          paymentDate: paymentDate,
        },
      });
    } catch (err: any) {
      toast.error(err.message || "Error al procesar el pago");
    } finally {
      setIsProcessingUploads(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <OrganizationSelector
        selectedOrganization={selectedOrganization}
        searchTerm={orgSearch}
        isSearching={isSearchingOrg}
        searchResults={orgResults}
        onSearchChange={setOrgSearch}
        onSelect={handleSelectOrg}
        onClear={handleClearOrg}
        forced={isForced}
      />

      <PlatformPlanSelector
        plans={plans}
        planId={planId}
        onPlanSelect={setPlanId}
        disabled={!organizationId}
      />

      {/* Trial toggle si el plan lo permite */}
      {selectedPlan && hasTrialDays && (
        <div className="flex items-center gap-3 p-3 rounded-lg border border-blue-500/20 bg-blue-500/5">
          <input
            id="is-trial"
            type="checkbox"
            checked={isTrial}
            onChange={(e) => setIsTrial(e.target.checked)}
            className="h-4 w-4 rounded border-white/20"
          />
          <label htmlFor="is-trial" className="text-sm font-medium cursor-pointer flex-1">
            Iniciar como prueba
            <span className="block text-xs text-muted-foreground font-normal">
              {selectedPlan.trialDays} días gratis antes del primer cobro
            </span>
          </label>
        </div>
      )}

      {selectedPlan && isFreePlan && !isTrial && (
        <div className="p-3 rounded-lg border border-emerald-500/20 bg-emerald-500/5">
          <p className="text-sm font-medium text-emerald-400">Plan gratuito</p>
          <p className="text-xs text-muted-foreground">
            No se requiere pago. La suscripción se activará inmediatamente.
          </p>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Input
          id="start-date"
          type="date"
          label="Fecha de Inicio"
          value={startDate}
          onChange={(e) => setStartDate(e.target.value)}
        />
        <Input
          id="end-date"
          type="date"
          label="Fecha de Vencimiento"
          value={previewEndDate}
          disabled
          title="Calculada según la duración del plan"
        />
      </div>

      {showPayment && (
        <PaymentSection
          selectedPlan={selectedPlan}
          paymentCurrency={paymentCurrency}
          paymentMethodId={paymentMethodId}
          activeCurrencies={activeCurrencies}
          activePaymentMethods={filteredPaymentMethods}
          finalAmount={finalAmount}
          currencyFormat={currencyFormat}
          selectedPaymentConfig={selectedPaymentConfig}
          dynamicFieldValues={dynamicFieldValues}
          onDynamicChange={(id, value) => setDynamicFieldValues((prev) => ({ ...prev, [id]: value }))}
          exchangeRate={exchangeRate}
          rateFocus={rateFocus}
          amountFocus={amountFocus}
          onRateFocus={setRateFocus}
          onAmountFocus={setAmountFocus}
          onRateChange={(val) => { setExchangeRate(val); setFinalAmount((Number(selectedPlan!.price) * val) / 100); }}
          onAmountChange={setFinalAmount}
          onCurrencyChange={handleCurrencyChange}
          onPaymentValidatedChange={setPaymentValidated}
          paymentValidated={paymentValidated}
          paymentDate={paymentDate}
          onPaymentDateChange={setPaymentDate}
          onMethodChange={(v) => { setPaymentMethodId(v); setDynamicFieldValues({}); }}
          allowPriceOverride={allowPriceOverride}
          paymentDetails={paymentDetails}
          onPaymentDetailsChange={setPaymentDetails}
        />
      )}

      <Button
        type="submit"
        disabled={isLoading || isProcessingUploads || !organizationId || !planId}
        className="w-full h-12 uppercase tracking-widest font-bold shadow-xl shadow-primary/5"
      >
        {isLoading || isProcessingUploads ? "PROCESANDO..." : "GENERAR SUSCRIPCIÓN"}
      </Button>
    </form>
  );
}
