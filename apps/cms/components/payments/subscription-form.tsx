"use client";

import * as React from "react";
import {
  type ISubscription,
  type IMembershipPlan,
  type PaginatedMembers,
  type IMember,
  type IPaymentMethodConfig,
  type IPaymentMethodDetail
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
  Text,
  cn,
  Badge
} from "@workspace/ui/components";
import { useDebounce } from "@/lib/hooks/use-debounce";
import { parseDateAsConfigTimezone, DEFAULT_TIMEZONE } from "@/lib/config/display";
import { useSettings, SETTINGS_KEYS } from "@/lib/hooks/use-settings";
import { ORG_ROLES } from "@workspace/shared";

// Sub-components
import { MemberSelector } from "./member-selector";
import { PlanSelector } from "./plan-selector";
import { PaymentSection } from "./payment-section";
import { CurrencyFormat } from "@/lib/utils/value-converters";

interface SubscriptionSubmitData extends Omit<ISubscription, "id" | "memberName" | "planName" | "status"> {
  payment: {
    amountPaid: number;
    currencyPaid: string;
    exchangeRateApplied?: string;
    paymentMethod: string;
    paymentMethodDetails?: IPaymentMethodDetail[] | Record<string, any>;
    status?: string;
    paymentDate?: Date | string;
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
  const [paymentValidated, setPaymentValidated] = React.useState(true);

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

  const [memberSearch, setMemberSearch] = React.useState("");
  const debouncedSearch = useDebounce(memberSearch, 500);
  const [searchResults, setSearchResults] = React.useState<PaginatedMembers["data"]>([]);
  const [isSearching, setIsSearching] = React.useState(false);

  // Lógica de Fecha Final Inteligente y Acumulativa
  React.useEffect(() => {
    const start = parseDateAsConfigTimezone(startDate, timezone);
    if (!Number.isNaN(start.getTime()) && selectedPlan) {
      const now = new Date();
      now.setHours(0, 0, 0, 0);

      // Determinamos el Baseline para el cálculo acumulativo
      // Si el socio tiene una suscripción VIGENTE, usamos suEndDate como base.
      // Si no, usamos la fecha de inicio seleccionada (Hoy).
      let baseline = new Date(start);
      if (selectedMember?.latestSubscription) {
        const currentExpiration = new Date(selectedMember.latestSubscription.endDate);
        if (currentExpiration >= now && selectedMember.latestSubscription.status === 'active') {
          baseline = new Date(currentExpiration);
        }
      }

      const end = new Date(baseline);
      const durationValue = selectedPlan.durationValue || 1;
      const durationUnit = selectedPlan.durationUnit || 'month';

      switch (durationUnit) {
        case 'day':
          end.setDate(end.getDate() + durationValue);
          break;
        case 'week':
          end.setDate(end.getDate() + (durationValue * 7));
          break;
        case 'month':
          end.setMonth(end.getMonth() + durationValue);
          break;
        case 'year':
          end.setFullYear(end.getFullYear() + durationValue);
          break;
        default:
          end.setMonth(end.getMonth() + 1);
      }

      const endStr = `${end.getFullYear()}-${String(end.getMonth() + 1).padStart(2, '0')}-${String(end.getDate()).padStart(2, '0')}`;
      setEndDate(endStr);
    } else if (!Number.isNaN(start.getTime()) && !selectedPlan) {
      const end = new Date(start);
      end.setMonth(end.getMonth() + 1);
      const endStr = `${end.getFullYear()}-${String(end.getMonth() + 1).padStart(2, '0')}-${String(end.getDate()).padStart(2, '0')}`;
      setEndDate(endStr);
    }
  }, [startDate, timezone, selectedPlan, selectedMember]);

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
          role: ORG_ROLES.MEMBER,
          includeLatestSubscription: true
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

  // Helper to validate payment fields
  const validatePaymentFields = () => {
    if (!memberId || !planId) return false;

    // Simple Date Validation
    const start = parseDateAsConfigTimezone(startDate, timezone);
    if (Number.isNaN(start.getTime())) {
      toast.error("Fecha de inicio inválida");
      return false;
    }

    if (selectedPaymentConfig) {
      for (const field of selectedPaymentConfig.fields) {
        const value = dynamicFieldValues[field.id];
        const isEmpty = value === undefined || value === null || (typeof value === 'string' && value.trim() === "");

        if (field.required && isEmpty) {
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

      let finalPaymentMethodDetails: IPaymentMethodDetail[] | Record<string, any> | undefined = undefined;

      if (selectedPaymentConfig && Object.keys(finalDetails).length > 0) {
        // Map field IDs to human-readable labels for self-descriptive data
        finalPaymentMethodDetails = selectedPaymentConfig.fields
          .filter(field => finalDetails[field.id] !== undefined)
          .map(field => ({
            label: field.label,
            value: finalDetails[field.id],
            type: field.type
          }));
      } else if (paymentDetails) {
        finalPaymentMethodDetails = [{
          label: "Nota / Referencia",
          value: paymentDetails,
          type: "text"
        }];
      }

      await onSubmit({
        memberId: memberId!,
        planId: planId!,
        startDate: startDateObj.toISOString(),
        endDate: endDateObj.toISOString(),
        payment: {
          amountPaid: Math.round(finalAmount * 100),
          currencyPaid: paymentCurrency,
          exchangeRateApplied: exchangeRate === 1 ? undefined : String(exchangeRate),
          paymentMethod: paymentMethodId,
          paymentMethodDetails: finalPaymentMethodDetails,
          status: paymentValidated ? 'validated' : 'processing',
          paymentDate: new Date(),
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

  const isPendingPayment = selectedMember?.latestSubscription?.paymentStatus === "processing";
  const isSectionDisabled = !selectedMember || isPendingPayment;

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

      {isPendingPayment && (
        <div className="p-4 rounded-xl border border-red-500/20 bg-red-500/5 animate-in fade-in zoom-in-95 duration-300">
          <div className="flex items-start gap-3">
            <Badge variant="destructive" size="sm" className="mt-0.5 uppercase font-black tracking-tighter">
              Bloqueo de Seguridad
            </Badge>
            <div className="flex flex-col gap-1">
              <Text weight="bold" size="sm" className="text-red-400">Pago pendiente detectado</Text>
              <Text size="xs" variant="muted">
                Este socio tiene una suscripción con pago en estado <span className="text-red-400 font-bold uppercase">Procesando</span>.
                Debe validar o anular el pago anterior antes de registrar uno nuevo.
              </Text>
            </div>
          </div>
        </div>
      )}

      <PlanSelector
        plans={plans}
        planId={planId}
        onPlanSelect={setPlanId}
        disabled={isSectionDisabled}
      />

      {selectedPlan && (
        <PaymentSection
          selectedPlan={selectedPlan}
          paymentCurrency={paymentCurrency}
          paymentMethodId={paymentMethodId}
          activeCurrencies={activeCurrencies}
          activePaymentMethods={activePaymentMethods}
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
          onPaymentValidatedChange={setPaymentValidated}
          paymentValidated={paymentValidated}
          onMethodChange={(v) => {
            setPaymentMethodId(v);
            setDynamicFieldValues({});
          }}
          allowPriceOverride={allowPriceOverride}
          paymentDetails={paymentDetails}
          onPaymentDetailsChange={setPaymentDetails}
          disabled={isSectionDisabled}
        />
      )}

      {/* Selector de Fechas */}
      <div className={cn("grid grid-cols-1 md:grid-cols-2 gap-4", isSectionDisabled && "cursor-not-allowed opacity-40")}>
        <Input
          id="start-date"
          type="date"
          label="Fecha de Inicio"
          value={startDate}
          disabled={isSectionDisabled}
          onChange={(e) => setStartDate(e.target.value)}
        />
        <Input
          id="end-date"
          type="date"
          label="Fecha Final"
          value={endDate}
          disabled={isSectionDisabled}
          onChange={(e) => setEndDate(e.target.value)}
        />
      </div>

      <Button
        type="submit"
        disabled={isLoading || isProcessingUploads || !memberId || !planId || isPendingPayment}
        className="w-full h-12 uppercase tracking-widest font-bold shadow-xl shadow-primary/5"
      >
        {isLoading || isProcessingUploads ? "PROCESANDO..." : "GENERAR SUSCRIPCIÓN"}
      </Button>
    </form>
  );
}
