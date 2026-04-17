"use client";

import * as React from "react";
import {
  type ISubscription,
  type IMembershipPlan,
  type PaginatedMembers,
  type IMember,
  type IPaymentMethodConfig
} from "@/types/dashboard";
import { uploadService } from "@/lib/services/upload-service";
import { membersService } from "@/lib/services/members-service";
import { plansService } from "@/lib/services/plans-service";
import { settingsService } from "@/lib/services/settings-service";
import { financeService } from "@/lib/services/finance-service";
import {
  Input,
  Button,
  toast,
} from "@workspace/ui/components";
import { useDebounce } from "@/lib/hooks/use-debounce";
import { parseDateAsConfigTimezone, DEFAULT_TIMEZONE } from "@/lib/config/display";
import { useSettings, SETTINGS_KEYS } from "@/lib/hooks/use-settings";
import { ORG_ROLES } from "@workspace/shared";

// Sub-components
import { MemberSelector } from "./member-selector";
import { PlanSelector } from "./plan-selector";
import { PaymentSection } from "./payment-section";
import { StatusSelector } from "./status-selector";
import { CurrencyFormat } from "@/lib/utils/value-converters";

interface SubscriptionSubmitData extends Omit<ISubscription, "id" | "memberName" | "planName"> {
  payment: {
    amountPaid: number;
    currencyPaid: string;
    exchangeRateApplied?: string;
    paymentMethod: string;
    paymentMethodDetails?: Record<string, any>;
  }
}

interface SubscriptionFormProps {
  readonly onSubmit: (data: SubscriptionSubmitData) => Promise<void>;
  readonly isLoading?: boolean;
  readonly onAddMemberClick?: (searchQuery: string) => void;
  readonly initialMember?: IMember | null;
}

export function SubscriptionForm({ onSubmit, isLoading, onAddMemberClick, initialMember }: SubscriptionFormProps) {
  const { settings } = useSettings();
  const timezone = settings[SETTINGS_KEYS.TIMEZONE] || DEFAULT_TIMEZONE;
  const [plans, setPlans] = React.useState<IMembershipPlan[]>([]);

  // States 
  const [selectedMember, setSelectedMember] = React.useState<IMember | null>(
    initialMember ?? null
  );

  // Sync with initialMember if it changes (callback from creation)
  React.useEffect(() => {
    if (initialMember) {
      setSelectedMember(initialMember);
      setMemberSearch("");
    }
  }, [initialMember]);
  const memberId = selectedMember?.id ?? null;
  const [planId, setPlanId] = React.useState<number | null>(null);

  // Payment States
  const [paymentCurrency, setPaymentCurrency] = React.useState<string>('USD');
  const [exchangeRate, setExchangeRate] = React.useState(1);
  const [finalAmount, setFinalAmount] = React.useState(0);
  const [paymentMethodId, setPaymentMethodId] = React.useState<string>('cash');
  const [paymentDetails, setPaymentDetails] = React.useState("");
  const [dynamicFieldValues, setDynamicFieldValues] = React.useState<Record<string, any>>({});
  const [allowPriceOverride, setAllowPriceOverride] = React.useState(false);
  const [isProcessingUploads, setIsProcessingUploads] = React.useState(false);
  const [isEditingPayment, setIsEditingPayment] = React.useState(false);

  // Input Focus States for "Veil" effect
  const [amountFocus, setAmountFocus] = React.useState(false);
  const [rateFocus, setRateFocus] = React.useState(false);

  const currencyFormat = (settings[SETTINGS_KEYS.CURRENCY_FORMAT] as CurrencyFormat) || "latam";

  const selectedPlan = React.useMemo(() => plans.find(p => p.id === planId), [plans, planId]);

  const d = new Date();
  const todayStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

  const [startDate, setStartDate] = React.useState(todayStr);
  const [endDate, setEndDate] = React.useState(() => {
    const date = new Date();
    date.setMonth(date.getMonth() + 1);
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
  });
  const [status, setStatus] = React.useState<"active" | "canceled">("active");

  const [memberSearch, setMemberSearch] = React.useState("");
  const debouncedSearch = useDebounce(memberSearch, 500);
  const [searchResults, setSearchResults] = React.useState<PaginatedMembers["data"]>([]);
  const [isSearching, setIsSearching] = React.useState(false);

  // Inicialización
  React.useEffect(() => {
    plansService.getAll().then(setPlans);
    settingsService.getByKey('allow_price_override').then(v => setAllowPriceOverride(v === 'true'));
  }, []);

  // Dynamic Lists from Settings
  const activeCurrencies = React.useMemo(() => {
    const val = settings[SETTINGS_KEYS.ACTIVE_CURRENCIES];
    if (!val) return ["USD", "VES"];
    try { return JSON.parse(val) as string[]; } catch { return ["USD"]; }
  }, [settings]);

  const activePaymentMethods = React.useMemo(() => {
    const val = settings[SETTINGS_KEYS.ACTIVE_PAYMENT_METHODS];
    if (!val) return [];
    try {
      return JSON.parse(val) as IPaymentMethodConfig[];
    } catch {
      return [];
    }
  }, [settings]);

  const selectedPaymentConfig = React.useMemo(() =>
    activePaymentMethods.find(m => m.id === paymentMethodId),
    [activePaymentMethods, paymentMethodId]
  );

  // Set default payment currency when plan changes
  React.useEffect(() => {
    if (selectedPlan) {
      setPaymentCurrency(selectedPlan.currency);
    }
  }, [selectedPlan]);

  // Fetch Exchange Rate and Calculate Amount
  React.useEffect(() => {
    const updateFinance = async () => {
      if (!selectedPlan) return;

      let rate = 1;
      if (paymentCurrency !== selectedPlan.currency) {
        rate = await financeService.getExchangeRate(selectedPlan.currency, paymentCurrency);
      }

      setExchangeRate(rate);
      setFinalAmount((selectedPlan.price * rate) / 100);
    };

    updateFinance();
  }, [selectedPlan, paymentCurrency]);

  // Buscar miembros dinámicamente
  React.useEffect(() => {
    if (!debouncedSearch) {
      setSearchResults([]);
      return;
    }

    let isMounted = true;
    const fetchMembers = async () => {
      setIsSearching(true);
      try {
        const res = await membersService.getMembers({
          query: debouncedSearch,
          limit: 5,
          role: ORG_ROLES.MEMBER
        });
        if (isMounted) setSearchResults(res.data);
      } catch (err) {
        console.error("Error buscando miembros", err);
      } finally {
        if (isMounted) setIsSearching(false);
      }
    };

    fetchMembers();
    return () => { isMounted = false; };
  }, [debouncedSearch]);

  // Actualizar fecha final automáticamente si cambia la inicial (1 mes después)
  React.useEffect(() => {
    const start = parseDateAsConfigTimezone(startDate, timezone);
    if (!Number.isNaN(start.getTime())) {
      const end = new Date(start);
      end.setMonth(end.getMonth() + 1);
      const endStr = `${end.getFullYear()}-${String(end.getMonth() + 1).padStart(2, '0')}-${String(end.getDate()).padStart(2, '0')}`;
      setEndDate(endStr);
    }
  }, [startDate, timezone]);

  // Helper to validate payment fields
  const validatePaymentFields = () => {
    if (!memberId || !planId) return false;

    if (selectedPaymentConfig) {
      for (const field of selectedPaymentConfig.fields) {
        if (field.required && !dynamicFieldValues[field.id]) {
          toast.error(`El campo "${field.label}" es obligatorio`);
          return false;
        }
      }
    }
    return true;
  };

  // Helper to process file uploads in dynamic fields
  const handleUploads = async () => {
    const finalDetails: Record<string, any> = { ...dynamicFieldValues };
    if (!selectedPaymentConfig) return finalDetails;

    for (const field of selectedPaymentConfig.fields) {
      const isFilePending = field.type === 'file' && dynamicFieldValues[field.id] instanceof File;
      if (isFilePending) {
        const file = dynamicFieldValues[field.id] as File;
        const timestamp = Date.now().toString().slice(-6);
        const clientName = `${selectedMember?.firstName}-${selectedMember?.lastName}`.toLowerCase().replaceAll(/\s+/g, '-');
        const methodName = selectedPaymentConfig.name.toLowerCase().replaceAll(/\s+/g, '-');
        const customName = `${clientName}_${methodName}_${timestamp}`;

        finalDetails[field.id] = await uploadService.uploadFile(file, "receipts", customName);
      }
    }
    return finalDetails;
  };

  const handleSubmit = async (e: React.SubmitEvent) => {
    e.preventDefault();
    if (!validatePaymentFields()) return;

    setIsProcessingUploads(true);
    try {
      const finalDetails = await handleUploads();

      const startDateObj = parseDateAsConfigTimezone(startDate, timezone);
      const endDateObj = parseDateAsConfigTimezone(endDate, timezone);

      let finalPaymentMethodDetails: Record<string, any> | undefined = undefined;
      if (Object.keys(finalDetails).length > 0) {
        finalPaymentMethodDetails = finalDetails;
      } else if (paymentDetails) {
        finalPaymentMethodDetails = { note: paymentDetails };
      }

      await onSubmit({
        memberId: memberId!,
        planId: planId!,
        startDate: startDateObj.toISOString(),
        endDate: endDateObj.toISOString(),
        status: status === "active" ? "active" : "canceled" as any,
        payment: {
          amountPaid: Math.round(finalAmount * 100),
          currencyPaid: paymentCurrency,
          exchangeRateApplied: exchangeRate === 1 ? undefined : String(exchangeRate),
          paymentMethod: paymentMethodId,
          paymentMethodDetails: finalPaymentMethodDetails
        }
      });
    } catch (err: any) {
      toast.error(err.message || "Error al procesar el pago");
    } finally {
      setIsProcessingUploads(false);
    }
  };

  const handleSelectMember = (member: IMember) => {
    setSelectedMember(member);
    setMemberSearch("");
    setSearchResults([]);
  };

  const handleClearMember = () => {
    setSelectedMember(null);
    setMemberSearch("");
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">

      <MemberSelector
        selectedMember={selectedMember}
        memberSearch={memberSearch}
        isSearching={isSearching}
        searchResults={searchResults}
        debouncedSearch={debouncedSearch}
        onSearchChange={setMemberSearch}
        onSelectMember={handleSelectMember}
        onClearMember={handleClearMember}
        onClearSearch={() => setMemberSearch("")}
        onAddMemberClick={onAddMemberClick}
      />

      <PlanSelector
        plans={plans}
        planId={planId}
        onPlanSelect={setPlanId}
      />

      {selectedPlan && (
        <PaymentSection
          selectedPlan={selectedPlan}
          paymentCurrency={paymentCurrency}
          paymentMethodId={paymentMethodId}
          activeCurrencies={activeCurrencies}
          activePaymentMethods={activePaymentMethods}
          isEditingPayment={isEditingPayment}
          onToggleEdit={() => setIsEditingPayment(!isEditingPayment)}
          finalAmount={finalAmount}
          currencyFormat={currencyFormat}
          selectedPaymentConfig={selectedPaymentConfig}
          dynamicFieldValues={dynamicFieldValues}
          onDynamicChange={(id, value) => setDynamicFieldValues(prev => ({ ...prev, [id]: value }))}
          exchangeRate={exchangeRate}
          rateFocus={rateFocus}
          amountFocus={amountFocus}
          onRateFocus={setRateFocus}
          onAmountFocus={setAmountFocus}
          onRateChange={(val) => {
            setExchangeRate(val);
            setFinalAmount((selectedPlan.price * val) / 100);
          }}
          onAmountChange={setFinalAmount}
          onCurrencyChange={setPaymentCurrency}
          onMethodChange={(v) => {
            setPaymentMethodId(v);
            setDynamicFieldValues({});
          }}
          allowPriceOverride={allowPriceOverride}
          paymentDetails={paymentDetails}
          onPaymentDetailsChange={setPaymentDetails}
        />
      )}

      {/* Selector de Fechas */}
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

      <StatusSelector
        status={status}
        onStatusChange={setStatus}
      />

      <Button
        type="submit"
        disabled={isLoading || isProcessingUploads || !memberId || !planId}
        className="w-full h-12 uppercase tracking-widest font-bold shadow-xl shadow-primary/5"
      >
        {isLoading || isProcessingUploads ? "PROCESANDO..." : "GENERAR SUSCRIPCIÓN"}
      </Button>
    </form>
  );
}
