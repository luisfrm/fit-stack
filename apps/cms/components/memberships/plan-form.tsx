"use client";

import * as React from "react";
import { type IMembershipPlan } from "@/types/dashboard";
import {
  Input,
  Button,
  Checkbox,
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem
} from "@workspace/ui/components";
import { useSettings, SETTINGS_KEYS } from "@/lib/hooks/use-settings";
import { Plus, Trash2, BadgeDollarSign, Loader2 } from "lucide-react";
import { Label } from "@workspace/ui/components/label";

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
    <form onSubmit={handleSubmit} className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        <div className="space-y-2 lg:col-span-1">
          <Label htmlFor="plan-name" className="text-sm font-medium uppercase tracking-tight text-slate-400">Nombre del Plan</Label>
          <Input 
            id="plan-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Ej: Platinum" 
            className={errors.name ? "border-red-500" : ""}
          />
          {errors.name && <p className="text-xs text-red-500">{errors.name}</p>}
        </div>

        <div className="space-y-2">
          <Label id="currency-label" className="text-sm font-medium uppercase tracking-tight text-slate-400">Moneda Base</Label>
          <Select 
            value={currency}
            onValueChange={(v) => setCurrency(v)}
          >
            <SelectTrigger aria-labelledby="currency-label">
              <SelectValue placeholder="Seleccionar Moneda" />
            </SelectTrigger>
            <SelectContent>
              {activeCurrencies.map(code => (
                <SelectItem key={code} value={code}>
                  {code}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <Label htmlFor="plan-price" className="text-sm font-medium uppercase tracking-tight text-slate-400">Precio Mensual</Label>
          <Input 
            id="plan-price"
            type="number" 
            step="0.01" 
            min="0"
            value={price}
            onChange={(e) => setPrice(e.target.value)}
            placeholder="45.00" 
            className={errors.price ? "border-red-500" : ""}
            leftIcon={<BadgeDollarSign size={16} className="text-slate-500" />}
          />
          {errors.price && <p className="text-xs text-red-500">{errors.price}</p>}
        </div>
      </div>

      <div className="flex flex-col gap-4 p-4 rounded-xl bg-white/2 border border-white/10">
        <div className="flex items-center justify-between">
          <div className="space-y-0.5">
            <span className="text-base font-medium">Destacar como Popular</span>
            <p className="text-[11px] text-slate-400">
              Añade una cinta dorada en la UI del plan.
            </p>
          </div>
          <Checkbox 
            checked={isPopular} 
            onCheckedChange={(c) => setIsPopular(!!c)} 
          />
        </div>

        <div className="flex items-center justify-between mt-4 border-t border-white/10 pt-4">
          <div className="space-y-0.5">
            <span className="text-base font-medium">Plan Activo (Habilitado)</span>
            <p className="text-[11px] text-slate-400">
              Si está apagado, aparecerá como "Borrador".
            </p>
          </div>
          <Checkbox 
            checked={isActive} 
            onCheckedChange={(c) => setIsActive(!!c)} 
          />
        </div>

        <div className="flex items-center justify-between mt-4 border-t border-white/10 pt-4">
          <div className="space-y-0.5">
            <span className="text-base font-medium">Visible en Sitio Web Público</span>
            <p className="text-[11px] text-slate-400">
              Controla la visibilidad en la landing page.
            </p>
          </div>
          <Checkbox 
            checked={isVisibleOnSite} 
            onCheckedChange={(c) => setIsVisibleOnSite(!!c)} 
          />
        </div>
      </div>

      {/* Builder de Features */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <Label className="text-base font-bold uppercase tracking-widest text-white/90">Beneficios (Features)</Label>
          <Button
            type="button"
            variant="outlined"
            size="sm"
            onClick={addFeature}
            className="border-primary/20 hover:border-primary/50 text-primary"
          >
            <Plus size={14} className="mr-1" />
            Añadir
          </Button>
        </div>
        
        <div className="space-y-2">
          {features.map((feat, index) => (
            <div key={feat.id} className="flex items-center gap-2">
              <Input 
                value={feat.text}
                onChange={(e) => updateFeature(index, e.target.value)}
                placeholder="Ej: Acceso a zonas VIP" 
                className="flex-1"
              />
              <Button 
                type="button" 
                variant="ghost" 
                size="icon" 
                className="text-red-400 hover:text-red-500 hover:bg-red-500/10 shrink-0"
                onClick={() => removeFeature(feat.id)}
              >
                <Trash2 size={16} />
              </Button>
            </div>
          ))}
          {features.length === 0 && (
            <p className="text-sm text-slate-500 italic text-center py-6 border-2 border-dashed border-white/10 rounded-2xl">
              No has agregado beneficios a este plan.
            </p>
          )}
        </div>
      </div>

      <Button type="submit" loading={isLoading} className="w-full h-12 text-sm uppercase tracking-widest font-bold shadow-lg shadow-primary/10">
        {isEdit ? "Guardar Cambios" : "Crear Plan"}
      </Button>
    </form>
  );
}
