"use client";

import * as React from "react";
import {
  type ISubscription,
  type IMembershipPlan,
  type PaginatedMembers,
  type IMember,
  type IPaymentMethodConfig,
  type IPaymentMethodDetails,
  type ITaxDetail
} from "@/types/dashboard";
import { uploadService } from "@/lib/services/upload-service";
import { membersService } from "@/lib/services/members-service";
import { plansService } from "@/lib/services/plans-service";
import { settingsService } from "@/lib/services/settings-service";
import { getExchangeRates } from "@/lib/api/exchange-rates";
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
import { addDuration, toLocalDayString } from "@workspace/shared/date";
import { useSettings, SETTINGS_KEYS } from "@/lib/hooks/use-settings";
import { useAuth } from "@/lib/hooks/use-auth";
import { apiCode } from "@/lib/errors";
import {
  centsToUnits,
  unitsToCents,
  parseRateValue,
  previewReceiptTaxes,
  resolveFiscalProfile,
  computeSubscriptionPeriod,
  ORG_ROLES,
  CurrencyFormat
} from "@workspace/shared";

// Sub-components
import { MemberSelector } from "./member-selector";
import { PlanSelector } from "./plan-selector";
import { PaymentSection } from "./payment-section";
import { type TaxMode } from "./tax-block";

interface SubscriptionSubmitData extends Omit<ISubscription, "id" | "memberName" | "planName" | "status" | "endDate"> {
  endDate?: string;
  endDateOverrideReason?: string;
  payment: {
    amountPaid: number;
    currencyPaid: string;
    exchangeRateApplied?: string;
    paymentMethod: string;
    paymentMethodDetails?: IPaymentMethodDetails;
    status?: string;
    paymentDate?: Date | string;
    subtotal?: number;
    taxTotal?: number;
    taxDetails?: ITaxDetail[];
    taxOverrideReason?: string;
  }
}

/**
 * Checks whether a dynamic field value is considered empty.
 */
function isFieldValueEmpty(value: unknown): boolean {
  if (value === undefined || value === null) return true;
  return typeof value === "string" && value.trim() === "";
}

/**
 * Validates that all required fields for the selected payment method are populated.
 */
function validateDynamicPaymentFields(
  config: IPaymentMethodConfig | undefined,
  fieldValues: Record<string, any>
): boolean {
  if (!config) return true;

  for (const field of config.fields) {
    if (field.type === "visual") continue;

    const value = fieldValues[field.id];
    if (field.required && isFieldValueEmpty(value)) {
      toast.error(`El campo "${field.label}" es obligatorio`);
      return false;
    }
  }

  return true;
}

/**
 * Validates tax override inputs and rates when taxMode is set to 'override'.
 */
function validateTaxOverrides(
  taxMode: TaxMode,
  reason: string,
  rateOverrides: Record<string, string>,
  preview: unknown
): boolean {
  if (taxMode !== "override") return true;

  if (!reason.trim()) {
    toast.error("Indica el motivo del ajuste manual de impuestos");
    return false;
  }

  for (const [name, raw] of Object.entries(rateOverrides)) {
    if (raw.trim() === "") continue;
    try {
      parseRateValue(raw);
    } catch {
      toast.error(`Tasa inválida para ${name}`);
      return false;
    }
  }

  if (!preview) {
    toast.error("No se pudo calcular el desglose de impuestos");
    return false;
  }

  return true;
}

interface SubscriptionFormProps {
  readonly onSubmit: (data: SubscriptionSubmitData) => Promise<void>;
  readonly isLoading?: boolean;
  readonly onAddMemberClick?: (searchQuery: string) => void;
  readonly initialMember?: IMember | null;
}

export function SubscriptionForm({ onSubmit, isLoading, onAddMemberClick, initialMember }: SubscriptionFormProps) {
  const { settings } = useSettings();
  const { activeOrganization } = useAuth();
  const timezone = activeOrganization?.timezone || DEFAULT_TIMEZONE;
  const [plans, setPlans] = React.useState<IMembershipPlan[]>([]);

  // States 
  const [selectedMember, setSelectedMember] = React.useState<IMember | null>(
    initialMember ?? null
  );

  // Sync with initialMember if it changes (callback from creation). También
  // resetea el override del periodo: el preview editado pertenece al miembro
  // anterior y no debe arrastrarse al nuevo (ver `resetPeriodOverride`).
  React.useEffect(() => {
    if (initialMember) {
      setSelectedMember(initialMember);
      setMemberSearch("");
      setEndDateDirty(false);
      setEndDateOverrideReason("");
    }
  }, [initialMember]);
  const memberId = selectedMember?.id ?? null;
  const [planId, setPlanId] = React.useState<number | null>(null);

  // Payment States
  const [paymentCurrency, setPaymentCurrency] = React.useState<string>('USD');
  const [exchangeRate, setExchangeRate] = React.useState(1);
  const [finalAmount, setFinalAmount] = React.useState(0);
  const [paymentMethodId, setPaymentMethodId] = React.useState<string>('');
  const [paymentDetails, setPaymentDetails] = React.useState("");
  const [dynamicFieldValues, setDynamicFieldValues] = React.useState<Record<string, any>>({});
  const [allowPriceOverride, setAllowPriceOverride] = React.useState(false);
  const [isProcessingUploads, setIsProcessingUploads] = React.useState(false);
  const [paymentValidated, setPaymentValidated] = React.useState(true);

  // Fiscal override (modo auto = el backend descompone; override = tasas
  // manuales + motivo de auditoría, montos siempre en centavos).
  const [taxMode, setTaxMode] = React.useState<TaxMode>("auto");
  const [taxRateOverrides, setTaxRateOverrides] = React.useState<Record<string, string>>({});
  const [taxOverrideReason, setTaxOverrideReason] = React.useState("");

  // Input Focus States for "Veil" effect
  const [amountFocus, setAmountFocus] = React.useState(false);
  const [rateFocus, setRateFocus] = React.useState(false);

  const currencyFormat = (activeOrganization?.currencyFormat ?? "latam") as CurrencyFormat;

  const selectedPlan = React.useMemo(() => plans.find(p => p.id === planId), [plans, planId]);

  const todayStr = toLocalDayString(timezone);
  const defaultEndStr = toLocalDayString(timezone, addDuration(new Date(), 1, 'month', timezone));

  const [startDate, setStartDate] = React.useState(todayStr);
  const [paymentDate, setPaymentDate] = React.useState(todayStr);
  const [endDate, setEndDate] = React.useState(defaultEndStr);
  // `endDate` es un preview editable: mientras el operador no lo toque
  // (`dirty` en false) se sincroniza con la regla compartida; al enviar
  // sin `dirty` no se manda `endDate` y el periodo lo fija el servidor.
  const [endDateDirty, setEndDateDirty] = React.useState(false);
  const [endDateOverrideReason, setEndDateOverrideReason] = React.useState("");
  // El cálculo local puede discrepar del servidor (el `latestSubscription` del
  // cliente puede estar desactualizado por caché): si el servidor responde 422
  // `END_DATE_OVERRIDE_REASON_REQUIRED`, forzamos la aparición del motivo y
  // refrescamos el latest del miembro para converger (#5).
  const [serverRequiresReason, setServerRequiresReason] = React.useState(false);

  const [memberSearch, setMemberSearch] = React.useState("");
  const debouncedSearch = useDebounce(memberSearch, 500);
  const [searchResults, setSearchResults] = React.useState<PaginatedMembers["data"]>([]);
  const [isSearching, setIsSearching] = React.useState(false);

  // Preview de Fecha Final con la regla compartida (Regla 4: ningún día
  // pagado se pierde). El latest sale de `selectedMember.latestSubscription`
  // (el search ya pide `includeLatestSubscription: true`). Sin plan o sin
  // miembro → +1 mes como antes (solo display, nunca se envía).
  const periodPreview = React.useMemo(() => {
    const start = parseDateAsConfigTimezone(startDate, timezone);
    if (Number.isNaN(start.getTime())) return null;
    if (!selectedPlan) {
      return {
        endDate: addDuration(start, 1, "month", timezone),
        hasActivePeriod: false,
      };
    }
    const rawLatest = selectedMember?.latestSubscription?.endDate;
    const parsed = rawLatest ? new Date(rawLatest) : null;
    return computeSubscriptionPeriod({
      startDate: start,
      latestEndDate: parsed && !Number.isNaN(parsed.getTime()) ? parsed : null,
      durationValue: selectedPlan.durationValue || 1,
      durationUnit: selectedPlan.durationUnit || "month",
      timezone,
    });
  }, [startDate, timezone, selectedPlan, selectedMember]);

  const computedEndStr = periodPreview
    ? toLocalDayString(timezone, periodPreview.endDate)
    : null;

  React.useEffect(() => {
    if (!endDateDirty && computedEndStr) setEndDate(computedEndStr);
  }, [computedEndStr, endDateDirty]);

  // Acorte de un periodo vigente (comparación a día local, como el
  // servidor: el mismo día cuenta como idempotente, no como recorte).
  const isShorteningActivePeriod =
    endDateDirty &&
    periodPreview !== null &&
    periodPreview.hasActivePeriod &&
    endDate !== "" &&
    computedEndStr !== null &&
    endDate < computedEndStr;

  // El campo motivo se exige si el cálculo local dice que acorta O si el
  // servidor ya lo pidió (autoridad final, nunca el texto del error).
  const requiresOverrideReason = isShorteningActivePeriod || serverRequiresReason;

  // Inicialización
  React.useEffect(() => {
    plansService.getAll().then(setPlans);
    settingsService.getByKey('allow_price_override').then(v => setAllowPriceOverride(v === 'true'));
  }, []);

  // Dynamic Lists from Settings
  const activeCurrencies = React.useMemo(() => {
    const val = settings[SETTINGS_KEYS.ACTIVE_CURRENCIES];
    if (!val) return [];
    try { return JSON.parse(val) as string[]; } catch { return []; }
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

  // Filter payment methods by selected currency
  const filteredPaymentMethods = React.useMemo(() => {
    return activePaymentMethods.filter(m =>
      m.currency === null || m.currency === paymentCurrency
    );
  }, [activePaymentMethods, paymentCurrency]);

  // Perfil fiscal de la org emisora (defaults del país + overrides).
  const fiscalProfile = React.useMemo(() => {
    const countryCode = activeOrganization?.countryCode;
    if (!countryCode) return null;
    try {
      return resolveFiscalProfile(countryCode, activeOrganization?.fiscalConfig);
    } catch {
      return null;
    }
  }, [activeOrganization]);

  // D6: un emisor que no declaró ser contribuyente formal no detalla
  // impuestos, así que tampoco puede ajustarlos a mano (el backend lo
  // rechaza con 400). El modo efectivo es siempre "auto" en ese caso.
  const effectiveTaxMode: TaxMode = fiscalProfile?.isFormalTaxpayer ? taxMode : "auto";

  // Preview del desglose con la única fuente compartida. En override se
  // aplican las tasas manuales; si alguna es inválida se muestra el auto y
  // el submit se bloquea con toast.
  const taxPreview = React.useMemo(() => {
    if (!fiscalProfile) return null;
    const totalCents = unitsToCents(finalAmount);
    try {
      if (effectiveTaxMode !== "override") {
        const auto = previewReceiptTaxes(totalCents, fiscalProfile, paymentCurrency);
        return { ...auto, lines: auto.taxDetails };
      }
      const taxes = fiscalProfile.taxes.map((tax) => {
        const raw = taxRateOverrides[tax.name];
        if (raw === undefined || raw.trim() === "") return tax;
        return { ...tax, rate: parseRateValue(raw) };
      });
      const custom = previewReceiptTaxes(totalCents, { ...fiscalProfile, taxes }, paymentCurrency);
      return { ...custom, lines: custom.taxDetails };
    } catch {
      return null;
    }
  }, [fiscalProfile, effectiveTaxMode, taxRateOverrides, finalAmount, paymentCurrency]);

  const handleTaxModeChange = (mode: TaxMode) => {
    setTaxMode(mode);
    if (mode === "override" && fiscalProfile && Object.keys(taxRateOverrides).length === 0) {
      setTaxRateOverrides(
        Object.fromEntries(
          fiscalProfile.taxes.map((tax) => [tax.name, String(Number((tax.rate * 100).toFixed(4)))]),
        ),
      );
    }
  };

  // Fetch Exchange Rate and Calculate Amount
  React.useEffect(() => {
    const updateFinance = async () => {
      if (!selectedPlan) {
        setFinalAmount(0);
        setExchangeRate(1);
        return;
      }

      let rate = 1;
      if (paymentCurrency !== selectedPlan.currency) {
        try {
          const rates = await getExchangeRates(selectedPlan.currency);
          rate = rates[paymentCurrency] ?? 1;
        } catch {
          rate = 1;
        }
      }

      setExchangeRate(rate);
      setFinalAmount(centsToUnits(selectedPlan.price * rate));
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

    if (!validateDynamicPaymentFields(selectedPaymentConfig, dynamicFieldValues)) {
      return false;
    }

    return validateTaxOverrides(effectiveTaxMode, taxOverrideReason, taxRateOverrides, taxPreview);
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

        finalDetails[field.id] = await uploadService.uploadFile(file, customName, "receipts");
      }
    }
    return finalDetails;
  };

  const handleSubmit = async (e: React.SubmitEvent) => {
    e.preventDefault();
    if (!validatePaymentFields()) return;

    // Acortar un periodo vigente exige motivo (validación local antes del
    // submit; si igual llega sin motivo el servidor responde 422).
    if (requiresOverrideReason && !endDateOverrideReason.trim()) {
      toast.error("Indica el motivo del ajuste de fecha");
      return;
    }

    setIsProcessingUploads(true);
    try {
      const finalDetails = await handleUploads();

      let finalPaymentMethodDetails: IPaymentMethodDetails | undefined = undefined;

      if (selectedPaymentConfig && Object.keys(finalDetails).length > 0) {
        // Map field IDs to human-readable labels for self-descriptive data
        // (visual fields are instructions, never persisted as payment details)
        finalPaymentMethodDetails = selectedPaymentConfig.fields
          .filter(field => field.type !== 'visual' && finalDetails[field.id] !== undefined)
          .map(field => ({
            label: field.label,
            value: finalDetails[field.id],
            type: field.type === 'visual' ? 'text' : field.type
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
        startDate: startDate, // Raw YYYY-MM-DD string, backend will handle timezone
        // Sin `dirty` no se envía `endDate`: el periodo lo fija el servidor.
        ...(endDateDirty ? { endDate: endDate } : {}),
        ...(requiresOverrideReason ? { endDateOverrideReason: endDateOverrideReason.trim() } : {}),
        payment: {
          amountPaid: unitsToCents(finalAmount),
          currencyPaid: paymentCurrency,
          exchangeRateApplied: exchangeRate === 1 ? undefined : String(exchangeRate),
          paymentMethod: selectedPaymentConfig?.name || paymentMethodId,
          paymentMethodDetails: finalPaymentMethodDetails,
          status: paymentValidated ? 'validated' : 'processing',
          paymentDate: paymentDate, // Send the selected date string
          // Modo auto: sin campos fiscales (el backend descompone).
          // Override: desglose en centavos + motivo de auditoría.
          ...(effectiveTaxMode === "override" && taxPreview
            ? {
              subtotal: taxPreview.subtotal,
              taxTotal: taxPreview.taxTotal,
              taxDetails: taxPreview.lines,
              taxOverrideReason: taxOverrideReason.trim(),
            }
            : {}),
        }
      });
    } catch (err: any) {
      console.error("Error processing subscription payment:", err);
      if (apiCode(err) === "END_DATE_OVERRIDE_REASON_REQUIRED") {
        // El servidor pide motivo (cálculo local desactualizado): forzamos el
        // campo y refrescamos el latest del miembro para que el preview
        // converja. El toast ya lo mostró quien maneja el submit.
        setServerRequiresReason(true);
        if (selectedMember) {
          const refreshed = await membersService.getMembers({
            query: selectedMember.email,
            role: ORG_ROLES.MEMBER,
            includeLatestSubscription: true,
            limit: 1,
          });
          const latestMember = refreshed.data.find((m) => m.id === selectedMember.id);
          if (latestMember) setSelectedMember(latestMember);
        }
      } else {
        toast.error("Error al procesar el pago");
      }
    } finally {
      setIsProcessingUploads(false);
    }
  };

  // El preview es una edición del operador atada al miembro/plan vigente: al
  // cambiar cualquiera de los dos, `dirty` y el motivo se resetean para no
  // arrastrar un período editado hacia otro miembro (el servidor aceptaría
  // libremente un `endDate` explícito en un período no vigente).
  const resetPeriodOverride = () => {
    setEndDateDirty(false);
    setEndDateOverrideReason("");
    setServerRequiresReason(false);
  };

  const handleSelectMember = (member: IMember) => {
    setSelectedMember(member);
    setMemberSearch("");
    setSearchResults([]);
    resetPeriodOverride();
  };

  const handleClearMember = () => {
    setSelectedMember(null);
    setMemberSearch("");
    resetPeriodOverride();
  };

  const handleSelectPlan = (id: number) => {
    setPlanId(id);
    resetPeriodOverride();
  };

  const isPendingPayment = selectedMember?.latestSubscription?.paymentStatus === "processing";
  const isSectionDisabled = !selectedMember || isPendingPayment;

  // Handler to change currency and reset payment method
  const handleCurrencyChange = (value: string) => {
    setPaymentCurrency(value);
    setPaymentMethodId(''); // Reset to show placeholder when currency changes
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

      {isPendingPayment && (
        <div className="p-4 rounded-xl border border-destructive/20 bg-destructive/5 animate-in fade-in zoom-in-95 duration-300">
          <div className="flex items-start gap-3">
            <Badge variant="destructive" size="sm" className="mt-0.5 uppercase font-black tracking-tighter">
              Bloqueo de Seguridad
            </Badge>
            <div className="flex flex-col gap-1">
              <Text weight="bold" size="sm" className="text-destructive/80">Pago pendiente detectado</Text>
              <Text size="xs" variant="muted">
                Este socio tiene una suscripción con pago en estado <span className="text-destructive/80 font-bold uppercase">Procesando</span>.
                Debe validar o anular el pago anterior antes de registrar uno nuevo.
              </Text>
            </div>
          </div>
        </div>
      )}

      <PlanSelector
        plans={plans}
        planId={planId}
        onPlanSelect={handleSelectPlan}
        disabled={isSectionDisabled}
      />

      {selectedPlan && (
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
          onDynamicChange={(id, value) => setDynamicFieldValues(prev => ({ ...prev, [id]: value }))}
          exchangeRate={exchangeRate}
          rateFocus={rateFocus}
          amountFocus={amountFocus}
          onRateFocus={setRateFocus}
          onAmountFocus={setAmountFocus}
          onRateChange={(val) => {
            setExchangeRate(val);
            setFinalAmount(centsToUnits(selectedPlan.price * val));
          }}
          onAmountChange={setFinalAmount}
          onCurrencyChange={handleCurrencyChange}
          onPaymentValidatedChange={setPaymentValidated}
          paymentValidated={paymentValidated}
          paymentDate={paymentDate}
          onPaymentDateChange={setPaymentDate}
          onMethodChange={(v) => {
            setPaymentMethodId(v);
            setDynamicFieldValues({});
          }}
          allowPriceOverride={allowPriceOverride}
          paymentDetails={paymentDetails}
          onPaymentDetailsChange={setPaymentDetails}
          disabled={isSectionDisabled}
          taxPreview={taxPreview}
          taxMode={taxMode}
          onTaxModeChange={handleTaxModeChange}
          taxRateOverrides={taxRateOverrides}
          onTaxRateChange={(name, pct) =>
            setTaxRateOverrides((prev) => ({ ...prev, [name]: pct }))
          }
          taxOverrideReason={taxOverrideReason}
          onTaxOverrideReasonChange={setTaxOverrideReason}
          taxEmitterIsFormal={fiscalProfile?.isFormalTaxpayer ?? false}
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
          onChange={(e) => { setEndDate(e.target.value); setEndDateDirty(true); }}
        />
      </div>

      {requiresOverrideReason && (
        <Input
          id="end-date-override-reason"
          label="Motivo del ajuste de fecha *"
          placeholder="Ej.: ajuste autorizado por gerencia"
          value={endDateOverrideReason}
          disabled={isSectionDisabled}
          required
          onChange={(e) => setEndDateOverrideReason(e.target.value)}
        />
      )}

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
