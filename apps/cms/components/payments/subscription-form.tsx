"use client";

import * as React from "react";
import {
  Currency,
  PaymentMethod,
  type ISubscription,
  type IMembershipPlan,
  type PaginatedMembers,
  type IMember
} from "@/types/dashboard";
import { membersService } from "@/lib/services/members-service";
import { plansService } from "@/lib/services/plans-service";
import { settingsService } from "@/lib/services/settings-service";
import { financeService } from "@/lib/services/finance-service";
import {
  Input,
  Button,
  ToggleGroup,
  ToggleGroupItem,
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
  Card
} from "@workspace/ui/components";
import { Search, X, Calculator, CircleDollarSign, CreditCard, CircleX } from "lucide-react";
import { useDebounce } from "@/lib/hooks/use-debounce";
import { Label } from "@workspace/ui/components/label";
import { parseDateAsConfigTimezone, DEFAULT_TIMEZONE } from "@/lib/config/display";
import { useSettings, SETTINGS_KEYS } from "@/lib/hooks/use-settings";
import { ROLE_IDS } from "@workspace/shared/constants";

interface SubscriptionSubmitData extends Omit<ISubscription, "id" | "memberName" | "planName"> {
  payment: {
    amountPaid: number;
    currencyPaid: Currency;
    exchangeRateApplied?: string;
    paymentMethod: PaymentMethod;
    paymentMethodDetails?: string;
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
  const [paymentCurrency, setPaymentCurrency] = React.useState<Currency>('USD');
  const [exchangeRate, setExchangeRate] = React.useState(1);
  const [finalAmount, setFinalAmount] = React.useState(0);
  const [paymentMethod, setPaymentMethod] = React.useState<PaymentMethod>('cash');
  const [paymentDetails, setPaymentDetails] = React.useState("");
  const [allowPriceOverride, setAllowPriceOverride] = React.useState(false);

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
          roleId: ROLE_IDS.CLIENT
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

  const handleSubmit = async (e: React.SubmitEvent) => {
    e.preventDefault();
    if (!memberId || !planId) return;

    const startDateObj = parseDateAsConfigTimezone(startDate, timezone);
    const endDateObj = parseDateAsConfigTimezone(endDate, timezone);

    await onSubmit({
      memberId,
      planId,
      startDate: startDateObj.toISOString(),
      endDate: endDateObj.toISOString(),
      status: status === "active" ? "active" : "canceled" as any,
      payment: {
        amountPaid: Math.round(finalAmount * 100),
        currencyPaid: paymentCurrency,
        exchangeRateApplied: exchangeRate === 1 ? undefined : String(exchangeRate),
        paymentMethod,
        paymentMethodDetails: paymentMethod === 'other' ? paymentDetails : undefined
      }
    });
  };

  const handleSelectMember = (member: PaginatedMembers["data"][0]) => {
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

      {/* Selector de Miembro */}
      <div className="space-y-2 relative">
        <Label id="member-search-label" className="text-sm font-medium">
          {selectedMember ? "Miembro Seleccionado" : "Buscar Miembro"}
        </Label>

        {selectedMember ? (
          <div className="p-4 rounded-xl border border-white/10 bg-white/2 flex items-center justify-between group animate-in fade-in slide-in-from-top-2 duration-300">
            <div className="flex flex-col gap-0.5">
              <span className="text-sm font-bold text-white uppercase tracking-tight leading-none">
                {selectedMember.firstName} {selectedMember.lastName}
              </span>
              <div className="flex items-center gap-2 mt-1">
                <span className="text-[10px] font-bold text-primary bg-primary/10 px-1.5 py-0.5 rounded border border-primary/20 uppercase">
                  {selectedMember.documentId}
                </span>
                <span className="text-xs text-slate-400 font-medium">{selectedMember.email}</span>
              </div>
            </div>
            <Button
              type="button"
              size="icon"
              variant="ghost"
              onClick={handleClearMember}
              className="hover:bg-red-500/10 hover:text-red-500 rounded-lg h-9 w-9 transition-colors"
            >
              <X className="w-4 h-4" />
            </Button>
          </div>
        ) : (
          <>
            <div className="relative">
              <Search className="absolute z-10 left-3 top-1/2 -translate-y-1/2 text-slate-400 w-4 h-4" />
              <Input
                id="member-search"
                placeholder="Escribe el nombre, email o DNI..."
                value={memberSearch}
                onChange={(e) => setMemberSearch(e.target.value)}
                className="pl-9"
                state={isSearching ? "loading" : "default"}
                autoComplete="off"
                aria-labelledby="member-search-label"
                rightElement={memberSearch && (
                  <button
                    type="button"
                    onClick={() => setMemberSearch("")}
                    className="flex items-center justify-center p-0.5 rounded-full text-red-500 hover:bg-red-500 hover:text-white transition-all duration-200"
                    title="Limpiar búsqueda"
                  >
                    <CircleX size={16} />
                  </button>
                )}
              />
            </div>

            {debouncedSearch && !isSearching && (
              <div className="absolute z-50 w-full bg-zinc-950 border border-white/10 rounded-xl overflow-hidden shadow-2xl mt-1 max-h-60 overflow-y-auto animate-in fade-in zoom-in-95 duration-200">
                {searchResults.length > 0 ? (
                  <>
                    {searchResults.map(member => (
                      <button
                        key={member.id}
                        type="button"
                        className="w-full text-left px-4 py-3 hover:bg-white/5 flex flex-col transition-colors border-b border-white/5 last:border-0"
                        onClick={() => handleSelectMember(member)}
                      >
                        <span className="text-sm font-semibold text-white">{member.firstName} {member.lastName} {member.documentId ? `• ${member.documentId}` : ""}</span>
                        <span className="text-xs text-slate-400">{member.email}</span>
                      </button>
                    ))}

                    {onAddMemberClick && (
                      <div className="p-3 border-t border-white/5 bg-white/2">
                        <button
                          type="button"
                          onClick={() => onAddMemberClick(debouncedSearch)}
                          className="w-full text-[10px] text-primary hover:underline font-bold text-center py-1 uppercase tracking-wider"
                        >
                          ¿No encuentras a quien buscabas? Crear nuevo miembro
                        </button>
                      </div>
                    )}
                  </>
                ) : (
                  <div className="p-6 flex flex-col items-center justify-center text-center gap-3">
                    <div className="size-12 rounded-full bg-white/5 flex items-center justify-center text-slate-500">
                      <Search size={24} className="opacity-20" />
                    </div>
                    <div className="space-y-1">
                      <p className="text-sm font-medium text-slate-300">Cliente no encontrado</p>
                      <p className="text-xs text-slate-500 italic">No hay resultados para "{debouncedSearch}"</p>
                    </div>
                    {onAddMemberClick && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => onAddMemberClick(debouncedSearch)}
                        className="mt-2 text-primary hover:bg-primary/10 font-bold"
                      >
                        ¿DESEA CREAR UNO NUEVO?
                      </Button>
                    )}
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </div>

      {/* Selector de Plan */}
      <div className="space-y-3">
        <Label id="plan-selection-label" className="text-sm font-medium">Plan de Membresía</Label>
        {plans.length === 0 ? (
          <p className="text-sm text-yellow-500 bg-yellow-500/10 p-3 rounded-lg">Carga planes primero en el módulo de Membresías.</p>
        ) : (
          <ToggleGroup
            type="single"
            value={planId ? String(planId) : ""}
            aria-labelledby="plan-selection-label"
            onValueChange={(val) => {
              if (val) setPlanId(Number(val));
            }}
            className="flex flex-wrap gap-2 justify-start"
          >
            {plans.filter(p => p.isActive).map(plan => (
              <ToggleGroupItem
                key={plan.id}
                value={String(plan.id)}
                className="rounded-xl border border-white/5 data-[state=on]:bg-primary data-[state=on]:text-black h-auto py-3 px-4 flex flex-col items-start gap-1"
              >
                <div className="flex items-center justify-between w-full gap-4">
                  <span className="font-bold text-sm uppercase">{plan.name}</span>
                  <span className="text-[10px] font-bold bg-white/10 px-1.5 py-0.5 rounded uppercase">{plan.currency}</span>
                </div>
                <span className="text-xs opacity-80">{plan.price / 100} {plan.currency}/mes</span>
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
        )}
      </div>

      {/* Detalles del Pago */}
      {selectedPlan && (
        <Card className="p-6 border-white/5 bg-white/2 space-y-5 animate-in fade-in slide-in-from-bottom-2 duration-500">
          <div className="flex items-center gap-2 mb-2">
            <Calculator className="w-5 h-5 text-primary" />
            <h3 className="text-sm font-bold uppercase tracking-widest text-white">Detalles del Pago</h3>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label id="payment-currency-label" className="text-xs font-semibold text-slate-400 uppercase">Moneda de Pago</Label>
              <Select
                value={paymentCurrency}
                onValueChange={(v) => setPaymentCurrency(v as Currency)}
              >
                <SelectTrigger aria-labelledby="payment-currency-label" className="w-full bg-white/2 border-white/5 h-10">
                  <SelectValue placeholder="Seleccionar Moneda" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="USD">Dólares (USD)</SelectItem>
                  <SelectItem value="VES">Bolívares (VES)</SelectItem>
                  <SelectItem value="EUR">Euros (EUR)</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label id="payment-method-label" className="text-xs font-semibold text-slate-400 uppercase">Método de Pago</Label>
              <Select
                value={paymentMethod}
                onValueChange={(v) => setPaymentMethod(v as PaymentMethod)}
              >
                <SelectTrigger aria-labelledby="payment-method-label" className="w-full bg-white/2 border-white/5 h-10">
                  <SelectValue placeholder="Seleccionar Método" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="cash">Efectivo</SelectItem>
                  <SelectItem value="zelle">Zelle</SelectItem>
                  <SelectItem value="pago_movil">Pago Móvil</SelectItem>
                  <SelectItem value="pos">Punto de Venta</SelectItem>
                  <SelectItem value="other">Otro</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {paymentCurrency !== selectedPlan.currency && (
              <div className="space-y-2">
                <Label htmlFor="exchange-rate" className="text-xs font-semibold text-slate-400 uppercase">
                  Tasa ({selectedPlan.currency} {"\u2192"} {paymentCurrency})
                </Label>
                <Input
                  id="exchange-rate"
                  type="number"
                  step="0.01"
                  value={exchangeRate}
                  onChange={(e) => {
                    const rate = Number(e.target.value);
                    setExchangeRate(rate);
                    setFinalAmount((selectedPlan.price * rate) / 100);
                  }}
                  leftIcon={<CircleDollarSign size={16} />}
                />
              </div>
            )}

            <div className="space-y-2">
              <Label htmlFor="final-amount" className="text-xs font-semibold text-slate-400 uppercase">Monto Total a Recibir</Label>
              <Input
                id="final-amount"
                type="number"
                step="0.01"
                value={finalAmount}
                onChange={(e) => setFinalAmount(Number(e.target.value))}
                readOnly={!allowPriceOverride}
                className={allowPriceOverride ? "" : "bg-white/5 opacity-70"}
                leftIcon={<CreditCard size={16} />}
              />
              {!allowPriceOverride && (
                <p className="text-[10px] text-slate-500 italic">Basado en el plan. No editable.</p>
              )}
            </div>
          </div>

          {paymentMethod === 'other' && (
            <div className="space-y-2 animate-in fade-in slide-in-from-top-1 duration-300">
              <Label id="other-method-details-label" className="text-xs font-semibold text-slate-400 uppercase">Especificar Método / Referencia</Label>
              <Input
                id="other-method-details"
                placeholder="Ej: Transferencia Banco Mercantil..."
                value={paymentDetails}
                onChange={(e) => setPaymentDetails(e.target.value)}
                aria-labelledby="other-method-details-label"
              />
            </div>
          )}
        </Card>
      )}

      {/* Selector de Fechas */}
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="start-date" className="text-sm font-medium uppercase tracking-tight text-slate-400">Fecha de Inicio</Label>
          <Input
            id="start-date"
            type="date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="end-date" className="text-sm font-medium uppercase tracking-tight text-slate-400">Fecha Final</Label>
          <Input
            id="end-date"
            type="date"
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
          />
        </div>
      </div>

      <div className="space-y-2">
        <Label id="status-selection-label" className="text-sm font-semibold text-white/50 uppercase tracking-widest text-[10px]">Estado del Alta</Label>
        <ToggleGroup
          type="single"
          value={status}
          aria-labelledby="status-selection-label"
          onValueChange={(v) => {
            if (v === "active" || v === "canceled") setStatus(v as any);
          }}
          className="flex gap-2"
        >
          <ToggleGroupItem
            value="active"
            className="flex-1 rounded-xl h-11 border border-white/5 data-[state=on]:bg-primary data-[state=on]:text-black font-bold transition-all uppercase tracking-widest text-xs"
          >
            ACTIVO
          </ToggleGroupItem>
          <ToggleGroupItem
            value="canceled"
            className="flex-1 rounded-xl h-11 border border-white/5 data-[state=on]:bg-red-500/10 data-[state=on]:text-red-500 font-bold transition-all uppercase tracking-widest text-xs"
          >
            INACTIVO
          </ToggleGroupItem>
        </ToggleGroup>
      </div>

      <Button type="submit" disabled={isLoading || !memberId || !planId} className="w-full h-12 uppercase tracking-widest font-bold shadow-xl shadow-primary/5">
        {isLoading ? "PROCESANDO..." : "GENERAR SUSCRIPCIÓN"}
      </Button>
    </form>
  );
}
