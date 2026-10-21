"use client";

import * as React from "react";
import {
  type ISubscription,
  type IMembershipPlan,
  type PaginatedMembers,
  type IMember,
  type IPaymentMethodConfig,
  type IPaymentMethodDetails
} from "@/types/dashboard";
import { uploadService } from "@/lib/services/upload-service";
import { membersService } from "@/lib/services/members-service";
import { plansService } from "@/lib/services/plans-service";
import { settingsService } from "@/lib/services/settings-service";
import { getExchangeRateSnapshot } from "@/lib/api/exchange-rates";
import {
  Input,
  Button,
  toast,
  Text,
  cn,
  Badge
} from "@workspace/ui/components";
import { useDebounce } from "@workspace/ui/hooks/use-debounce";
import {
  parseDateAsConfigTimezone,
  exchangeRateAppliedValue,
  paymentConversionView,
  type ExchangeRateLoadStatus,
  type ExchangeRateSnapshot,
  apiCode,
  centsToUnits,
  unitsToCents,
  previewReceiptTaxes,
  resolveFiscalProfile,
  computeSubscriptionPeriod,
  ORG_ROLES,
} from "@workspace/shared";
import { addDuration, toLocalDayString } from "@workspace/shared/date";

import { useSettings, SETTINGS_KEYS } from "@/lib/hooks/use-settings";
import { useOrgAuth } from "@workspace/auth/org";
import { requireOrgConfig, type OrgConfig } from "@/lib/org-config";

// Sub-components
import { MemberSelector } from "./member-selector";
import { PlanSelector } from "./plan-selector";
import { PaymentSection } from "./payment-section";

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
 * Maps dynamic or freeform payment details into structured IPaymentMethodDetails.
 */
function buildPaymentMethodDetails(
  selectedPaymentConfig: IPaymentMethodConfig | undefined,
  finalDetails: Record<string, any>,
  paymentDetails: string
): IPaymentMethodDetails | undefined {
  if (selectedPaymentConfig && Object.keys(finalDetails).length > 0) {
    return selectedPaymentConfig.fields
      .filter((field) => field.type !== "visual" && finalDetails[field.id] !== undefined)
      .map((field) => ({
        label: field.label,
        value: finalDetails[field.id],
        type: field.type === "visual" ? "text" : field.type,
      }));
  }

  if (paymentDetails) {
    return [
      {
        label: "Nota / Referencia",
        value: paymentDetails,
        type: "text",
      },
    ];
  }

  return undefined;
}

interface SubscriptionFormProps {
  readonly onSubmit: (data: SubscriptionSubmitData) => Promise<void>;
  readonly isLoading?: boolean;
  readonly onAddMemberClick?: (searchQuery: string) => void;
  readonly initialMember?: IMember | null;
}

/**
 * Resolves the required org config before mounting the form: while the session
 * is resolving it shows a skeleton, and once settled it shows a visible error
 * instead of inventing "America/Caracas"/"latam" (AGENTS.md §9/§10).
 */
export function SubscriptionForm(props: SubscriptionFormProps) {
  const { activeOrganization, isPending } = useOrgAuth();

  const resolved = React.useMemo(() => {
    try {
      return {
        config: requireOrgConfig(activeOrganization),
        error: null as string | null,
      };
    } catch (err) {
      return {
        config: null,
        error:
          err instanceof Error
            ? err.message
            : "Organization configuration is incomplete.",
      };
    }
  }, [activeOrganization]);

  if (!resolved.config) {
    if (isPending) {
      return (
        <div className="space-y-4 animate-pulse" aria-hidden="true">
          <div className="h-24 bg-foreground/5 rounded-xl" />
          <div className="h-40 bg-foreground/5 rounded-xl" />
        </div>
      );
    }
    return (
      <div
        role="alert"
        className="bg-foreground/5 border border-border rounded-xl p-6 space-y-2"
      >
        <Text weight="bold" size="lg">
          No se pudo cargar la configuración de la organización
        </Text>
        <Text size="sm" variant="muted">
          {resolved.error}
        </Text>
      </div>
    );
  }

  return <SubscriptionFormContent {...props} orgConfig={resolved.config} />;
}

function SubscriptionFormContent({
  orgConfig,
  onSubmit,
  isLoading,
  onAddMemberClick,
  initialMember,
}: SubscriptionFormProps & { readonly orgConfig: OrgConfig }) {
  const { settings } = useSettings();
  const { activeOrganization } = useOrgAuth();
  const timezone = orgConfig.timezone;
  const [plans, setPlans] = React.useState<IMembershipPlan[]>([]);

  // States 
  const [selectedMember, setSelectedMember] = React.useState<IMember | null>(
    initialMember ?? null
  );

  // Sync with initialMember if it changes (callback from creation). Also
  // resets period override: edited preview belongs to previous member
  // and must not carry over to the new one (see `resetPeriodOverride`).
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
  const [rateSnapshot, setRateSnapshot] = React.useState<ExchangeRateSnapshot | null>(null);
  const [rateStatus, setRateStatus] = React.useState<ExchangeRateLoadStatus>('idle');
  const [rateReloadToken, setRateReloadToken] = React.useState(0);
  const [finalAmount, setFinalAmount] = React.useState(0);
  const [paymentMethodId, setPaymentMethodId] = React.useState<string>('');
  const [paymentDetails, setPaymentDetails] = React.useState("");
  const [dynamicFieldValues, setDynamicFieldValues] = React.useState<Record<string, any>>({});
  const [allowPriceOverride, setAllowPriceOverride] = React.useState(false);
  const [isProcessingUploads, setIsProcessingUploads] = React.useState(false);
  const [paymentValidated, setPaymentValidated] = React.useState(true);

  // Input Focus States for "Veil" effect
  const [amountFocus, setAmountFocus] = React.useState(false);

  const currencyFormat = orgConfig.currencyFormat;

  const selectedPlan = React.useMemo(() => plans.find(p => p.id === planId), [plans, planId]);

  const todayStr = toLocalDayString(timezone);
  const defaultEndStr = toLocalDayString(timezone, addDuration(new Date(), 1, 'month', timezone));

  const [startDate, setStartDate] = React.useState(todayStr);
  const [paymentDate, setPaymentDate] = React.useState(todayStr);
  const [endDate, setEndDate] = React.useState(defaultEndStr);
  // `endDate` is an editable preview: as long as operator does not edit it
  // (`dirty` is false) it syncs with shared business rule; on submit
  // without `dirty` no `endDate` is sent and period is determined by server.
  const [endDateDirty, setEndDateDirty] = React.useState(false);
  const [endDateOverrideReason, setEndDateOverrideReason] = React.useState("");
  // Local calculation may differ from server (client `latestSubscription`
  // could be stale due to cache): if server responds 422
  // `END_DATE_OVERRIDE_REASON_REQUIRED`, force reason field display and
  // refresh member latest subscription to converge (#5).
  const [serverRequiresReason, setServerRequiresReason] = React.useState(false);

  const [memberSearch, setMemberSearch] = React.useState("");
  const debouncedSearch = useDebounce(memberSearch, 500);
  const [searchResults, setSearchResults] = React.useState<PaginatedMembers["data"]>([]);
  const [isSearching, setIsSearching] = React.useState(false);

  // End Date preview with shared rule (Rule 4: no paid day is lost).
  // Latest comes from `selectedMember.latestSubscription` (search requests
  // `includeLatestSubscription: true`). Without plan or member → +1 month
  // (display only, never sent to server).
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

  // Shortening an active period (local day comparison matching server:
  // same day counts as idempotent, not a shortening).
  const isShorteningActivePeriod =
    endDateDirty &&
    periodPreview !== null &&
    periodPreview.hasActivePeriod &&
    endDate !== "" &&
    computedEndStr !== null &&
    endDate < computedEndStr;

  // Reason field is required if local calculation detects shortening OR
  // server already requested it (final authority, never error text).
  const requiresOverrideReason = isShorteningActivePeriod || serverRequiresReason;

  // Initialization
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

  // Fiscal profile of the issuer org: taxes and label come from the country
  // (`COUNTRIES`, SSOT) plus the Console-governed `isFormalTaxpayer`.
  const fiscalProfile = React.useMemo(() => {
    const countryCode = activeOrganization?.countryCode;
    if (!countryCode) return null;
    try {
      return resolveFiscalProfile(countryCode, activeOrganization?.fiscalConfig);
    } catch {
      return null;
    }
  }, [activeOrganization]);

  // Breakdown preview using the single shared source of truth (the same
  // function the backend uses at emission time). Nothing is editable here:
  // rates come from `COUNTRIES`, never from the operator.
  const taxPreview = React.useMemo(() => {
    if (!fiscalProfile) return null;
    try {
      const auto = previewReceiptTaxes(unitsToCents(finalAmount), fiscalProfile, paymentCurrency);
      return { ...auto, lines: auto.taxDetails };
    } catch {
      return null;
    }
  }, [fiscalProfile, finalAmount, paymentCurrency]);

  // Exchange rate and converted amount. The rate is READ-ONLY and comes from
  // the exchange-rates API: it is never editable here.
  React.useEffect(() => {
    if (!selectedPlan) {
      setRateSnapshot(null);
      setRateStatus('idle');
      setFinalAmount(0);
      return;
    }

    if (paymentCurrency === selectedPlan.currency) {
      setRateSnapshot(null);
      setRateStatus('ready');
      setFinalAmount(centsToUnits(selectedPlan.price));
      return;
    }

    let cancelled = false;
    setRateSnapshot(null);
    setRateStatus('loading');
    setFinalAmount(0);

    getExchangeRateSnapshot(selectedPlan.currency)
      .then((snapshot) => {
        if (cancelled) return;
        setRateSnapshot(snapshot);
        const rate = snapshot.rates[paymentCurrency];
        const isValidRate =
          typeof rate === 'number' && Number.isFinite(rate) && rate > 0;
        if (!isValidRate) {
          // Provider responded but without this currency: never assume a rate.
          setRateStatus('error');
          return;
        }
        setRateStatus('ready');
        setFinalAmount(centsToUnits(selectedPlan.price * rate));
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        console.error('Error fetching exchange rates', error);
        setRateStatus('error');
      });

    return () => {
      cancelled = true;
    };
  }, [selectedPlan, paymentCurrency, rateReloadToken]);

  const conversion = React.useMemo(
    () =>
      paymentConversionView(
        selectedPlan?.currency ?? '',
        paymentCurrency,
        rateSnapshot,
        rateStatus,
      ),
    [selectedPlan, paymentCurrency, rateSnapshot, rateStatus],
  );

  // Dynamically search members
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

    if (selectedPlan && !conversion.canSubmit) {
      toast.error("La tasa de cambio aún no está disponible. El pago está bloqueado hasta que cargue.");
      return false;
    }

    // Simple Date Validation
    const start = parseDateAsConfigTimezone(startDate, timezone);
    if (Number.isNaN(start.getTime())) {
      toast.error("Fecha de inicio inválida");
      return false;
    }

    if (paymentMethodId !== "other" && !selectedPaymentConfig) {
      toast.error("El método de pago seleccionado ya no está disponible. Recarga la página.");
      return false;
    }

    if (paymentMethodId === "other" && !paymentDetails.trim()) {
      toast.error("Especifica el método de pago");
      return false;
    }

    if (!validateDynamicPaymentFields(selectedPaymentConfig, dynamicFieldValues)) {
      return false;
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

        finalDetails[field.id] = await uploadService.uploadFile(file, customName, "receipts");
      }
    }
    return finalDetails;
  };

  const buildSubmitPayload = (
    finalPaymentMethodDetails: IPaymentMethodDetails | undefined
  ): SubscriptionSubmitData => {
    const paymentMethod =
      paymentMethodId === "other"
        ? paymentDetails.trim()
        : selectedPaymentConfig!.name;

    const payload: SubscriptionSubmitData = {
      memberId: memberId!,
      planId: planId!,
      startDate,
      payment: {
        amountPaid: unitsToCents(finalAmount),
        currencyPaid: paymentCurrency,
        exchangeRateApplied: exchangeRateAppliedValue(conversion),
        paymentMethod,
        paymentMethodDetails: finalPaymentMethodDetails,
        status: paymentValidated ? "validated" : "processing",
        paymentDate,
      },
    };

    if (endDateDirty) {
      payload.endDate = endDate;
    }
    if (requiresOverrideReason) {
      payload.endDateOverrideReason = endDateOverrideReason.trim();
    }

    return payload;
  };

  const handleSubmissionError = async (err: unknown) => {
    console.error("Error processing subscription payment:", err);
    // SOLE owner of submit toast: the modal (`SubscriptionModal`), which
    // maps business error codes. Here only local state is updated;
    // toasting here as well would duplicate the notification (1 action → 1 toast).
    if (apiCode(err) !== "END_DATE_OVERRIDE_REASON_REQUIRED") return;

    // Server requires reason (stale local calculation): force field
    // and refresh member latest subscription so preview converges.
    setServerRequiresReason(true);
    if (!selectedMember) return;

    const refreshed = await membersService.getMembers({
      query: selectedMember.email,
      role: ORG_ROLES.MEMBER,
      includeLatestSubscription: true,
      limit: 1,
    });
    const latestMember = refreshed.data.find((m) => m.id === selectedMember.id);
    if (latestMember) {
      setSelectedMember(latestMember);
    }
  };

  const handleSubmit = async (e: React.SubmitEvent) => {
    e.preventDefault();
    if (!validatePaymentFields()) return;

    // Shortening an active period requires a reason (local validation before submit;
    // if submitted without reason the server responds with 422).
    if (requiresOverrideReason && !endDateOverrideReason.trim()) {
      toast.error("Indica el motivo del ajuste de fecha");
      return;
    }

    setIsProcessingUploads(true);
    try {
      const finalDetails = await handleUploads();
      const finalPaymentMethodDetails = buildPaymentMethodDetails(
        selectedPaymentConfig,
        finalDetails,
        paymentDetails
      );
      const payload = buildSubmitPayload(finalPaymentMethodDetails);
      await onSubmit(payload);
    } catch (err: unknown) {
      await handleSubmissionError(err);
    } finally {
      setIsProcessingUploads(false);
    }
  };

  // Preview is an operator edit tied to active member/plan: when
  // either changes, `dirty` and reason reset to avoid dragging
  // an edited period to another member (server would freely accept
  // an explicit `endDate` on an inactive period).
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
          conversion={conversion}
          rateStatus={rateStatus}
          onRetryRate={() => setRateReloadToken((value) => value + 1)}
          amountFocus={amountFocus}
          onAmountFocus={setAmountFocus}
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
          taxEmitterIsFormal={fiscalProfile?.isFormalTaxpayer ?? false}
        />
      )}

      {/* Date Selector */}
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
        disabled={isLoading || isProcessingUploads || !memberId || !planId || isPendingPayment || !conversion.canSubmit}
        className="w-full h-12 uppercase tracking-widest font-bold shadow-xl shadow-primary/5"
      >
        {isLoading || isProcessingUploads ? "PROCESANDO..." : "GENERAR SUSCRIPCIÓN"}
      </Button>
    </form>
  );
}
