"use client";

import * as React from "react";
import {
  Button,
  Input,
  Text,
  Separator,
  SimpleSelect,
  CurrencySelector,
  CheckboxCard
} from "@workspace/ui/components";
import { type IPlatformPlan } from "@workspace/shared/types";
import { Users, Globe } from "lucide-react";
import { cleanNumericInput } from "@/lib/utils/helper";
import { usePlatformSettings, PLATFORM_SETTINGS_KEYS } from "@/lib/hooks/use-platform-settings";

interface PlatformPlanFormProps {
  readonly initialData?: Partial<IPlatformPlan>;
  readonly onSubmit: (data: any) => Promise<void>;
  readonly isLoading: boolean;
}

export function PlatformPlanForm({ initialData, onSubmit, isLoading }: PlatformPlanFormProps) {
  const { settings } = usePlatformSettings();

  const activeCurrencies: string[] = React.useMemo(() => {
    const active = settings[PLATFORM_SETTINGS_KEYS.ACTIVE_CURRENCIES];
    if (!active) return ["USD"];
    try {
      return JSON.parse(active);
    } catch {
      return ["USD"];
    }
  }, [settings]);

  const defaultCurrency = React.useMemo(() => {
    const primary = settings[PLATFORM_SETTINGS_KEYS.PRIMARY_CURRENCY];
    return primary && activeCurrencies.includes(primary) ? primary : (activeCurrencies[0] || "USD");
  }, [settings, activeCurrencies]);

  const [formData, setFormData] = React.useState({
    name: initialData?.name || "",
    price: initialData?.price ? (initialData.price / 100).toString() : "0",
    currency: initialData?.currency || defaultCurrency,
    durationValue: initialData?.durationValue?.toString() || "1",
    durationUnit: initialData?.durationUnit || "month",
    isActive: initialData?.isActive ?? true,
    features: {
      limits: {
        members: initialData?.features?.limits?.members?.toString() || "0",
        coaches: initialData?.features?.limits?.coaches?.toString() || "0"
      },
      access: initialData?.features?.access || {
        pwa: false,
        blog: false,
        web_commercial: false
      }
    }
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

  const updateLimit = (key: keyof typeof formData.features.limits, val: string) => {
    const processed = cleanNumericInput(formData.features.limits[key], val);

    setFormData(prev => ({
      ...prev,
      features: {
        ...prev.features,
        limits: {
          ...prev.features.limits,
          [key]: processed
        }
      }
    }));
  };

  const updateFeatureAccess = (key: keyof typeof formData.features.access, val: boolean) => {
    setFormData(prev => ({
      ...prev,
      features: {
        ...prev.features,
        access: {
          ...prev.features.access,
          [key]: val
        }
      }
    }));
  };

  const handleSubmit = async (e: React.SubmitEvent) => {
    e.preventDefault();

    // Convert centenas para el API
    const priceInCents = Math.round(Number(formData.price) * 100);

    const submissionData = {
      name: formData.name,
      price: priceInCents,
      currency: formData.currency,
      durationValue: Number.parseInt(formData.durationValue, 10) || 1,
      durationUnit: formData.durationUnit,
      isActive: formData.isActive,
      features: {
        ...formData.features,
        limits: {
          members: Number.parseInt(formData.features.limits.members, 10) || 0,
          coaches: Number.parseInt(formData.features.limits.coaches, 10) || 0,
        }
      }
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

      {/* Status */}
      <div className="col-span-full">
        <CheckboxCard
          id="isActive"
          label="Plan Activo"
          description="Habilitar para nuevas suscripciones."
          checked={formData.isActive}
          onCheckedChange={(val) => setFormData(p => ({ ...p, isActive: val }))}
        />
      </div>

      <Separator className="bg-white/10 my-2" />

      {/* Limits */}
      <div className="space-y-4">
        <div className="flex items-center gap-2 mb-2">
          <Users size={18} className="text-primary" />
          <Text size="sm" weight="bold" className="text-white uppercase tracking-widest">Límites de Uso (0 = Ilimitado)</Text>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <Input
            label="Máx. Miembros"
            type="number"
            min="0"
            value={formData.features.limits?.members}
            onChange={(e) => updateLimit('members', e.target.value)}
          />
          <Input
            label="Máx. Coaches"
            type="number"
            min="0"
            value={formData.features.limits?.coaches}
            onChange={(e) => updateLimit('coaches', e.target.value)}
          />
        </div>
      </div>

      <Separator className="bg-white/10" />

      {/* Access Control */}
      <div className="space-y-4">
        <div className="flex items-center gap-2 mb-2">
          <Globe size={18} className="text-primary" />
          <Text size="sm" weight="bold" className="text-white uppercase tracking-widest">Accesos y Módulos</Text>
        </div>

        <div className="flex flex-col gap-3">
          <CheckboxCard
            id="pwa"
            checked={formData.features.access?.pwa}
            onCheckedChange={(val) => updateFeatureAccess('pwa', val)}
            label="Acceso a PWA"
            description="Permitir uso de la aplicación móvil."
          />
          <CheckboxCard
            id="blog"
            checked={formData.features.access?.blog}
            onCheckedChange={(val) => updateFeatureAccess('blog', val)}
            label="Módulo de Blog"
            description="Habilitar creación de contenido informativo."
          />
          <CheckboxCard
            id="web_commercial"
            checked={formData.features.access?.web_commercial}
            onCheckedChange={(val) => updateFeatureAccess('web_commercial', val)}
            label="Web Comercial"
            description="Habilitar sitio corporativo personalizable."
          />
        </div>
      </div>

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
