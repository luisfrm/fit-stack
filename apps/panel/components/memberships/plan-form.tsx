"use client";

import * as React from "react";
import { type IMembershipPlan } from "@/types/dashboard";
import {
  Input,
  Button,
  CheckboxCard,
  CurrencySelector,
  SimpleSelect,
  Label,
} from "@workspace/ui/components";
import { useSettings, SETTINGS_KEYS } from "@/lib/hooks/use-settings";
import { Plus, Trash2, BadgeDollarSign, Loader2, Save, Send } from "lucide-react";

interface PlanFormProps {
  readonly initialData?: IMembershipPlan;
  readonly onSubmit: (data: Omit<IMembershipPlan, "id">) => Promise<void>;
  readonly isLoading?: boolean;
}

interface FeatureItem {
  id: string;
  text: string;
}

export function PlanForm({ initialData, onSubmit, isLoading }: PlanFormProps) {
  const { settings, isLoading: isLoadingSettings } = useSettings();
  const isEdit = !!initialData?.id;

  const [name, setName] = React.useState(initialData?.name || "");
  const [price, setPrice] = React.useState(initialData?.price ? (initialData.price / 100).toString() : "0");
  const [currency, setCurrency] = React.useState<string>(initialData?.currency || "USD");
  const [durationValue, setDurationValue] = React.useState(initialData?.durationValue || 1);
  const [durationUnit, setDurationUnit] = React.useState<"day" | "week" | "month" | "year">(initialData?.durationUnit || "month");

  const [isActive, setIsActive] = React.useState(initialData?.isActive ?? true);
  const [isPopular, setIsPopular] = React.useState(initialData?.isPopular ?? false);
  const [isVisibleOnSite, setIsVisibleOnSite] = React.useState(initialData?.isVisibleOnSite ?? true);
  const [features, setFeatures] = React.useState<FeatureItem[]>(
    (initialData?.features || []).map(f => ({ id: crypto.randomUUID(), text: f }))
  );

  const [errors, setErrors] = React.useState<{ name?: string; price?: string }>({});

  const activeCurrencies = React.useMemo(() => {
    const rawActive = settings[SETTINGS_KEYS.ACTIVE_CURRENCIES];
    if (!rawActive) return ["USD"];
    try {
      return JSON.parse(rawActive) as string[];
    } catch {
      return ["USD"];
    }
  }, [settings]);

  // Sync frequency selection
  const [frequency, setFrequency] = React.useState<string>(() => {
    if (!initialData) return "monthly";
    const { durationValue: v, durationUnit: u } = initialData;
    if (v === 1 && u === "day") return "daily";
    if (v === 1 && u === "week") return "weekly";
    if (v === 1 && u === "month") return "monthly";
    if (v === 3 && u === "month") return "quarterly";
    if (v === 6 && u === "month") return "semiannual";
    if (v === 1 && u === "year") return "annual";
    return "custom";
  });

  const handleFrequencyChange = (val: string) => {
    setFrequency(val);
    if (val === "daily") { setDurationValue(1); setDurationUnit("day"); }
    else if (val === "weekly") { setDurationValue(1); setDurationUnit("week"); }
    else if (val === "monthly") { setDurationValue(1); setDurationUnit("month"); }
    else if (val === "quarterly") { setDurationValue(3); setDurationUnit("month"); }
    else if (val === "semiannual") { setDurationValue(6); setDurationUnit("month"); }
    else if (val === "annual") { setDurationValue(1); setDurationUnit("year"); }
  };

  // Ensure selected currency is valid if settings change
  React.useEffect(() => {
    if (!activeCurrencies.includes(currency) && activeCurrencies.length > 0) {
      setCurrency(activeCurrencies[0]!);
    }
  }, [activeCurrencies]);

  const validate = () => {
    const nextErrors: { name?: string; price?: string } = {};
    if (!name.trim()) nextErrors.name = "El nombre es obligatorio.";
    if (!price || Number.isNaN(Number(price)) || Number(price) < 0) nextErrors.price = "Ingresa un precio válido.";
    setErrors(nextErrors);
    return Object.keys(nextErrors).length === 0;
  };

  const handleSubmit = async (e: React.SubmitEvent) => {
    e.preventDefault();
    if (!validate()) return;

    const priceInCents = Math.round(Number(price) * 100);

    await onSubmit({
      name,
      price: priceInCents,
      currency,
      durationValue,
      durationUnit,
      isActive,
      isPopular,
      isVisibleOnSite,
      features: features.map(f => f.text).filter(t => t.trim().length > 0)
    });
  };

  const addFeature = () => setFeatures([...features, { id: crypto.randomUUID(), text: "" }]);

  const updateFeature = (index: number, val: string) => {
    const newFeatures = [...features];
    newFeatures[index]!.text = val;
    setFeatures(newFeatures);
  };

  const removeFeature = (id: string) => {
    setFeatures(features.filter(f => f.id !== id));
  };

  if (isLoadingSettings) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-6 h-6 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="grid grid-cols-1 md:grid-cols-2 gap-5 py-4">
      {/* Información Básica */}
      <Input
        label="Nombre del Plan"
        id="plan-name"
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="Ej: Platinum"
        hint={errors.name}
        state={errors.name ? "error" : "default"}
      />

      <CurrencySelector
        label="Moneda Base"
        value={currency}
        onChange={setCurrency}
        currencies={activeCurrencies}
      />

      <SimpleSelect
        label="Frecuencia"
        value={frequency}
        onChange={handleFrequencyChange}
        placeholder="Periodicidad"
        options={[
          { value: "daily", label: "Diario" },
          { value: "weekly", label: "Semanal" },
          { value: "monthly", label: "Mensual" },
          { value: "quarterly", label: "Trimestral (3m)" },
          { value: "semiannual", label: "Semestral (6m)" },
          { value: "annual", label: "Anual" },
          { value: "custom", label: "Personalizado" },
        ]}
      />

      <Input
        label="Precio"
        id="plan-price"
        type="number"
        step="0.01"
        allowNegative={false}
        value={price}
        onChange={(e) => setPrice(e.target.value)}
        placeholder="0.00"
        hint={errors.price}
        state={errors.price ? "error" : "default"}
        leftIcon={<BadgeDollarSign size={16} />}
      />

      {/* Configuración Personalizada si aplica */}
      {frequency === "custom" && (
        <div className="col-span-full grid grid-cols-1 md:grid-cols-2 gap-4 p-4 rounded-xl bg-primary/5 border border-primary/10 animate-in fade-in slide-in-from-top-2 duration-300">
          <Input
            label="Duración (Valor)"
            type="number"
            allowNegative={false}
            value={durationValue}
            onChange={(e) => setDurationValue(Number(e.target.value))}
          />
          <SimpleSelect
            label="Unidad de Tiempo"
            value={durationUnit}
            onChange={(v: any) => setDurationUnit(v)}
            options={[
              { value: "day", label: "Días" },
              { value: "week", label: "Semanas" },
              { value: "month", label: "Meses" },
              { value: "year", label: "Años" },
            ]}
          />
        </div>
      )}

      {/* Estados y Visibilidad */}
      <div className="col-span-full flex flex-col gap-3 pt-2">
        <CheckboxCard
          id="isPopular"
          checked={isPopular}
          onCheckedChange={(c) => setIsPopular(!!c)}
          label="Destacar como Popular"
          description="Añade una cinta dorada en la UI del plan."
        />

        <CheckboxCard
          id="isActive"
          checked={isActive}
          onCheckedChange={(c) => setIsActive(!!c)}
          label="Plan Activo (Habilitado)"
          description='Si está desactivado, aparecerá como "Borrador".'
        />

        <CheckboxCard
          id="isVisibleOnSite"
          checked={isVisibleOnSite}
          onCheckedChange={(c) => setIsVisibleOnSite(!!c)}
          label="Visible en Sitio Web Público"
          description="Controla la visibilidad en la landing page comercial."
        />
      </div>

      {/* Builder de Features */}
      <div className="col-span-full flex flex-col gap-4 pt-2">
        <div className="flex items-center justify-between pb-1">
          <Label className="text-xs font-semibold uppercase tracking-wider text-gray-400">Beneficios (Features)</Label>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={addFeature}
            className="h-8"
          >
            <Plus size={14} className="mr-1" />
            Añadir
          </Button>
        </div>

        <div className="flex flex-col gap-3">
          {features.map((feat, index) => (
            <div key={feat.id} className="flex items-center gap-2 animate-in fade-in slide-in-from-left-2 duration-200">
              <Input
                value={feat.text}
                onChange={(e) => updateFeature(index, e.target.value)}
                placeholder="Ej: Acceso a zonas VIP"
                className="h-12"
                wrapperClassName="flex-1"
              />
              <Button
                type="button"
                variant="ghost-danger"
                size="icon"
                onClick={() => removeFeature(feat.id)}
                className="shrink-0"
              >
                <Trash2 size={18} />
              </Button>
            </div>
          ))}
          {features.length === 0 && (
            <div className="text-sm text-slate-500 italic text-center py-8 border-2 border-dashed border-white/5 rounded-2xl">
              No has agregado beneficios a este plan.
            </div>
          )}
        </div>
      </div>

      {/* Acción Final */}
      <div className="col-span-full pt-4">
        <Button
          type="submit"
          fullWidth
          size="lg"
          loading={isLoading}
          rightIcon={!isLoading && (isEdit ? <Save size={18} /> : <Send size={18} />)}
        >
          {isEdit ? "GUARDAR CAMBIOS" : "CREAR PLAN"}
        </Button>
      </div>
    </form>
  );
}
