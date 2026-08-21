"use client";

import * as React from "react";
import {
  Button,
  Input,
  Text,
  SimpleSelect,
  CurrencySelector,
  CheckboxCard
} from "@workspace/ui/components";
import { type IPlatformPlan } from "@workspace/shared/types";
import { cleanNumericInput } from "@/lib/utils/helper";
import { PLATFORM_SETTINGS_KEYS } from "@/lib/config/platform-settings";
import { FeaturesEditor } from "./features-editor";
import {
  FEATURE_CATALOG,
  resolveFeatures,
  type FeatureCatalog,
  type PlanFeaturesV2,
} from "@workspace/shared";

interface PlatformPlanFormProps {
  readonly initialData?: Partial<IPlatformPlan>;
  readonly onSubmit: (data: any) => Promise<void>;
  readonly isLoading: boolean;
  readonly settings?: Record<string, string>;
  readonly catalog?: FeatureCatalog;
}

export function PlatformPlanForm({ initialData, onSubmit, isLoading, settings, catalog }: PlatformPlanFormProps) {
  const platformSettings = React.useMemo(() => settings ?? {}, [settings]);
  const activeCatalog = catalog ?? FEATURE_CATALOG;

  const activeCurrencies: string[] = React.useMemo(() => {
    const active = platformSettings[PLATFORM_SETTINGS_KEYS.ACTIVE_CURRENCIES];
    if (!active) return ["USD"];
    try {
      return JSON.parse(active);
    } catch {
      return ["USD"];
    }
  }, [platformSettings]);

  const defaultCurrency = React.useMemo(() => {
    const primary = platformSettings[PLATFORM_SETTINGS_KEYS.PRIMARY_CURRENCY];
    return primary && activeCurrencies.includes(primary) ? primary : (activeCurrencies[0] || "USD");
  }, [platformSettings, activeCurrencies]);

  const [formData, setFormData] = React.useState({
    name: initialData?.name || "",
    price: initialData?.price ? (initialData.price / 100).toString() : "0",
    currency: initialData?.currency || defaultCurrency,
    durationValue: initialData?.durationValue?.toString() || "1",
    durationUnit: initialData?.durationUnit || "month",
    isActive: initialData?.isActive ?? true,
    isTrial: (initialData as { trialDays?: number })?.trialDays ? (initialData as { trialDays?: number }).trialDays! > 0 : false,
    trialDays: ((initialData as { trialDays?: number })?.trialDays ?? 14).toString(),
    features: resolveFeatures(initialData?.features as PlanFeaturesV2 | null | undefined),
  });

  // Frequency auto-complete logic
  const [frequency, setFrequency] = React.useState<string>(() => {
    if (!initialData?.durationValue) return "monthly";
    const v = initialData.durationValue;
    const u = initialData.durationUnit;
    if (v === 1 && u === "day") return "daily";
    if (v === 1 && u === "week") return "weekly";
    if (v === 1 && u === "month") return "monthly";
    if (v === 1 && u === "year") return "annual";
    return "custom";
  });

  const handleFrequencyChange = (val: string) => {
    setFrequency(val);
    if (val === "daily") setFormData(prev => ({ ...prev, durationValue: "1", durationUnit: "day" }));
    else if (val === "weekly") setFormData(prev => ({ ...prev, durationValue: "1", durationUnit: "week" }));
    else if (val === "monthly") setFormData(prev => ({ ...prev, durationValue: "1", durationUnit: "month" }));
    else if (val === "annual") setFormData(prev => ({ ...prev, durationValue: "1", durationUnit: "year" }));
  };

  const handleSubmit = async (e: React.SubmitEvent) => {
    e.preventDefault();

    // Convert dezenas para el API
    const priceInCents = Math.round(Number(formData.price) * 100);

    const submissionData = {
      name: formData.name,
      price: priceInCents,
      currency: formData.currency,
      durationValue: Number.parseInt(formData.durationValue, 10) || 1,
      durationUnit: formData.durationUnit,
      isActive: formData.isActive,
      trialDays: formData.isTrial ? Math.max(1, Number.parseInt(formData.trialDays, 10) || 14) : 0,
      features: formData.features,
    };

    await onSubmit(submissionData);
  };

  const submitButtonText = initialData?.id ? "ACTUALIZAR PLAN" : "CREAR PLAN";

  return (
    <form onSubmit={handleSubmit} className="space-y-6 py-4">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Basic Info */}
        <Input
          label="Nombre del Plan"
          value={formData.name}
          onChange={(e) => setFormData(p => ({ ...p, name: e.target.value }))}
          placeholder="Ej: Plan Basic..."
          required
        />

        <SimpleSelect
          label="Frecuencia"
          value={frequency}
          onChange={handleFrequencyChange}
          options={[
            { value: "daily", label: "Diario" },
            { value: "weekly", label: "Semanal" },
            { value: "monthly", label: "Mensual" },
            { value: "annual", label: "Anual" },
            { value: "custom", label: "Personalizado" },
          ]}
        />

        <Input
          label="Precio (USD)"
          type="number"
          step="0.01"
          min="0"
          value={formData.price}
          onChange={(e) => {
            const val = e.target.value;
            const processed = cleanNumericInput(formData.price, val);
            setFormData(p => ({ ...p, price: processed }));
          }}
          placeholder="0.00"
          required
        />

        <CurrencySelector
          label="Moneda"
          value={formData.currency}
          onChange={(v) => setFormData(p => ({ ...p, currency: v }))}
          currencies={activeCurrencies}
        />
      </div>

      {/* Custom Duration Fields */}
      {frequency === "custom" && (
        <div className="grid grid-cols-2 gap-4 p-4 rounded-xl bg-primary/5 border border-primary/10 animate-in fade-in slide-in-from-top-2">
          <div className="space-y-2">
            <Text size="xs" weight="bold" className="text-primary/70 uppercase">Valor</Text>
            <Input
              type="number"
              min="1"
              value={formData.durationValue}
              onChange={(e) => setFormData(p => ({ ...p, durationValue: e.target.value }))}
            />
          </div>
          <div className="space-y-0">
            <SimpleSelect
              label="Unidad"
              value={formData.durationUnit}
              onChange={(v: any) => setFormData(p => ({ ...p, durationUnit: v }))}
              options={[
                { value: "day", label: "Días" },
                { value: "week", label: "Semanas" },
                { value: "month", label: "Meses" },
                { value: "year", label: "Años" },
              ]}
            />
          </div>
        </div>
      )}

      {/* Status — estructura plana sin card anidada */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <CheckboxCard
          id="isActive"
          label="Plan activo"
          description="Visible para nuevas suscripciones."
          checked={formData.isActive}
          onCheckedChange={(val) => setFormData(p => ({ ...p, isActive: val }))}
        />
        <CheckboxCard
          id="isTrial"
          label="Plan de prueba — isTrial"
          description={formData.isTrial ? `Trial de ${formData.trialDays} días sin cobro inicial.` : "Si se marca, la suscripción inicia como trial."}
          checked={formData.isTrial}
          onCheckedChange={(val) => setFormData(p => ({ ...p, isTrial: val }))}
        />
      </div>

      {formData.isTrial && (
        <div className="flex items-end gap-3 pl-1 animate-in fade-in slide-in-from-top-1 duration-200">
          <div className="w-32">
            <Input
              label="Días de trial"
              type="number"
              min="1"
              max="90"
              value={formData.trialDays}
              onChange={(e) => {
                const processed = cleanNumericInput(formData.trialDays, e.target.value);
                setFormData(p => ({ ...p, trialDays: processed }));
              }}
              placeholder="14"
            />
          </div>
          <Text size="xs" variant="muted" className="pb-2.5">
            0 = sin trial · recomendado 7–14 días
          </Text>
        </div>
      )}

      <div className="h-px bg-border-muted my-1" />

      {/* Features (dynamic from catalog) — lista plana */}
      <FeaturesEditor
        catalog={activeCatalog}
        features={formData.features}
        onChange={(features) => setFormData(p => ({ ...p, features }))}
      />

      <div className="pt-4">
        <Button
          type="submit"
          variant="primary"
          fullWidth
          disabled={isLoading}
        >
          {isLoading ? "Guardando..." : submitButtonText}
        </Button>
      </div>
    </form>
  );
}