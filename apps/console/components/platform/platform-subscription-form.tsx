"use client";

import * as React from "react";
import {
  Input,
  Button,
  toast,
  Text,
  cn
} from "@workspace/ui/components";
import {
  type IPlatformOrganization,
  type IPlatformPlan,
  type IPaymentMethodConfig,
  type IPaymentMethodDetail
} from "@workspace/shared/types";
import { uploadService } from "@/lib/services/upload-service";
import { organizationsService } from "@/lib/services/organizations-service";
import { platformPlansService } from "@/lib/services/platform-plans-service";
import { useDebounce } from "@/lib/hooks/use-debounce";
import { usePlatformSettings, PLATFORM_SETTINGS_KEYS } from "@/lib/hooks/use-platform-settings";
import { useExchangeRates } from "@/lib/hooks/use-exchange-rates";
import { type CurrencyFormat } from "@/lib/utils/value-converters";
import { OrganizationSelector } from "./organization-selector";
import { PaymentSection } from "./payment-section";
import { PlatformPlanSelector } from "./platform-plan-selector";

interface PaymentData {
  amountPaid: number;
  currencyPaid: string;
  exchangeRateApplied?: string;
  paymentMethod: string;
  paymentMethodDetails?: IPaymentMethodDetail[] | Record<string, any>;
  status?: string;
  paymentDate?: string;
}

interface PlatformSubscriptionSubmitData {
  organizationId: string;
  planId: number;
  startDate: string;
  endDate: string;
  isTrial: boolean;
  priceOverride?: string;
  payment: PaymentData;
}

interface PlatformSubscriptionFormProps {
  readonly onSubmit: (data: PlatformSubscriptionSubmitData) => Promise<void>;
  readonly isLoading?: boolean;
  readonly initialOrganization?: IPlatformOrganization | null;
}

export function PlatformSubscriptionForm({
  onSubmit,
  isLoading,
  initialOrganization
}: PlatformSubscriptionFormProps) {
  const { settings } = usePlatformSettings();
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
  const [endDate, setEndDate] = React.useState(() => {
    const date = new Date();
    date.setMonth(date.getMonth() + 1);
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
  });
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

  const currencyFormat = (settings[PLATFORM_SETTINGS_KEYS.CURRENCY_FORMAT] as CurrencyFormat) || "latam";

  const selectedPlan = React.useMemo(() => plans.find((p) => p.id === planId) ?? null, [plans, planId]);
  const isTrial = selectedPlan ? Number(selectedPlan.price) === 0 : false;

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
    setAllowPriceOverride(settings["allow_price_override"] === "true");
  }, []);

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
    const val = settings[PLATFORM_SETTINGS_KEYS.ACTIVE_CURRENCIES];
    if (!val) return ["USD", "VES"];
    try { return JSON.parse(val) as string[]; } catch { return ["USD"]; }
  }, [settings]);

  const activePaymentMethods = React.useMemo(() => {
    const val = settings[PLATFORM_SETTINGS_KEYS.ACTIVE_PAYMENT_METHODS];
    if (!val) return [];
    try { return JSON.parse(val) as IPaymentMethodConfig[]; } catch { return []; }
  }, [settings]);

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
      if (isTrial) {
        await onSubmit({
          organizationId,
          planId,
          startDate,
          endDate,
          isTrial: true,
          payment: {
            amountPaid: 0,
            currencyPaid: planCurrency,
            paymentMethod: "trial",
            status: "validated",
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
        endDate,
        isTrial: false,
        payment: {
          amountPaid: Math.round(finalAmount * 100),
          currencyPaid: paymentCurrency,
          exchangeRateApplied: exchangeRate === 1 ? undefined : String(exchangeRate),
          paymentMethod: selectedPaymentConfig?.name || paymentMethodId,
          paymentMethodDetails: finalPaymentMethodDetails,
          status: paymentValidated ? "validated" : "processing",
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
          label="Fecha Final"
          value={endDate}
          onChange={(e) => setEndDate(e.target.value)}
        />
      </div>

      {selectedPlan && !isTrial && (
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
          onRateChange={(val) => { setExchangeRate(val); setFinalAmount((Number(selectedPlan.price) * val) / 100); }}
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
