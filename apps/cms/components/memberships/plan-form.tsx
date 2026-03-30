"use client";

import * as React from "react";
import { type IMembershipPlan } from "@/types/dashboard";
import {
  Input,
  Button,
  Checkbox
} from "@workspace/ui/components";
import { Plus, Trash2 } from "lucide-react";

interface PlanFormProps {
  readonly initialData?: IMembershipPlan;
  readonly onSubmit: (data: Omit<IMembershipPlan, "id">) => Promise<void>;
  readonly isLoading?: boolean;
}

export function PlanForm({ initialData, onSubmit, isLoading }: PlanFormProps) {
  const isEdit = !!initialData?.id;

  const [name, setName] = React.useState(initialData?.name || "");
  const [price, setPrice] = React.useState(initialData?.price ? (initialData.price / 100).toString() : "0");
  const [isPopular, setIsPopular] = React.useState(initialData?.isPopular ?? false);
  const [isVisibleOnSite, setIsVisibleOnSite] = React.useState(initialData?.isVisibleOnSite ?? true);
  const [features, setFeatures] = React.useState<string[]>(initialData?.features || []);

  const [errors, setErrors] = React.useState<{ name?: string; price?: string }>({});

  const validate = () => {
    const nextErrors: { name?: string; price?: string } = {};
    if (!name.trim()) nextErrors.name = "El nombre es obligatorio.";
    if (!price || isNaN(Number(price)) || Number(price) < 0) nextErrors.price = "Ingresa un precio válido.";
    setErrors(nextErrors);
    return Object.keys(nextErrors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate()) return;

    const priceInCents = Math.round(Number(price) * 100);

    await onSubmit({
      name,
      price: priceInCents,
      isPopular,
      isVisibleOnSite,
      features: features.filter(f => f.trim().length > 0)
    });
  };

  const addFeature = () => setFeatures([...features, ""]);
  
  const updateFeature = (index: number, val: string) => {
    const newFeatures = [...features];
    newFeatures[index] = val;
    setFeatures(newFeatures);
  };

  const removeFeature = (index: number) => {
    const newFeatures = features.filter((_, i) => i !== index);
    setFeatures(newFeatures);
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="space-y-2">
          <label className="text-sm font-medium">Nombre del Plan</label>
          <Input 
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Ej: Platinum" 
            className={errors.name ? "border-red-500" : ""}
          />
          {errors.name && <p className="text-xs text-red-500">{errors.name}</p>}
        </div>

        <div className="space-y-2">
          <label className="text-sm font-medium">Precio Mensual ($)</label>
          <Input 
            type="number" 
            step="0.01" 
            min="0"
            value={price}
            onChange={(e) => setPrice(e.target.value)}
            placeholder="45.00" 
            className={errors.price ? "border-red-500" : ""}
          />
          {errors.price && <p className="text-xs text-red-500">{errors.price}</p>}
        </div>
      </div>

      <div className="flex flex-col gap-4 p-4 rounded-xl bg-white/5 border border-white/10">
        <div className="flex items-center justify-between">
          <div className="space-y-0.5">
            <span className="text-base font-medium">Destacar como Popular</span>
            <p className="text-[11px] text-slate-400">
              Añade una cinta dorada en la UI del plan. Solo debería haber uno.
            </p>
          </div>
          <Checkbox 
            checked={isPopular} 
            onCheckedChange={(c) => setIsPopular(!!c)} 
          />
        </div>

        <div className="flex items-center justify-between mt-4 border-t border-white/5 pt-4">
          <div className="space-y-0.5">
            <span className="text-base font-medium">Visible en Sitio Web</span>
            <p className="text-[11px] text-slate-400">
              Si está apagado, funciona como borrador y los usuarios no podrán comprarlo.
            </p>
          </div>
          <Checkbox 
            checked={isVisibleOnSite} 
            onCheckedChange={(c) => setIsVisibleOnSite(!!c)} 
          />
        </div>
      </div>

      {/* Builder de Features */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <label className="text-base font-medium">Lista de Beneficios (Features)</label>
          <Button
            type="button"
            variant="outlined"
            size="sm"
            onClick={addFeature}
          >
            <Plus size={14} className="mr-1" />
            Añadir Beneficio
          </Button>
        </div>
        
        <div className="space-y-2">
          {features.map((feat, index) => (
            <div key={index} className="flex items-center gap-2">
              <Input 
                value={feat}
                onChange={(e) => updateFeature(index, e.target.value)}
                placeholder="Ej: Acceso a zonas VIP" 
                className="flex-1"
              />
              <Button 
                type="button" 
                variant="ghost" 
                size="icon" 
                className="text-red-400 hover:text-red-500 hover:bg-red-500/10 shrink-0"
                onClick={() => removeFeature(index)}
              >
                <Trash2 size={16} />
              </Button>
            </div>
          ))}
          {features.length === 0 && (
            <p className="text-sm text-slate-500 italic text-center py-4 bg-black/20 rounded-lg">
              No has agregado beneficios a este plan.
            </p>
          )}
        </div>
      </div>

      <Button type="submit" disabled={isLoading} className="w-full h-12 text-sm uppercase tracking-widest font-bold">
        {isLoading ? (isEdit ? "Guardando..." : "Creando...") : (isEdit ? "Guardar Cambios" : "Crear Plan")}
      </Button>
    </form>
  );
}
