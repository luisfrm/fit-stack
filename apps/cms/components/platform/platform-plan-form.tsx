"use client";

import * as React from "react";
import {
  Button,
  Input,
  Text,
  Switch,
  Separator
} from "@workspace/ui/components";
import { type IPlatformPlan, type PlanFeatures } from "@workspace/shared/types";
import { Building2, Users, Smartphone, Globe, BookOpen } from "lucide-react";

interface PlatformPlanFormProps {
  readonly initialData?: Partial<IPlatformPlan>;
  readonly onSubmit: (data: any) => Promise<void>;
  readonly isLoading: boolean;
}

export function PlatformPlanForm({ initialData, onSubmit, isLoading }: PlatformPlanFormProps) {
  const [formData, setFormData] = React.useState({
    name: initialData?.name || "",
    monthlyPrice: initialData?.monthlyPrice?.toString() || "0",
    suggestedDurationDays: initialData?.suggestedDurationDays || 30,
    isActive: initialData?.isActive ?? true,
    features: (initialData?.features || {
      limits: { members: 0, coaches: 0 },
      access: { pwa: false, blog: false, web_commercial: false }
    }) as PlanFeatures
  });

  const handleSubmit = async (e: React.SubmitEvent) => {
    e.preventDefault();
    await onSubmit(formData);
  };

  const updateFeatureAccess = (key: keyof NonNullable<PlanFeatures["access"]>, val: boolean) => {
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

  const updateLimit = (key: keyof NonNullable<PlanFeatures["limits"]>, val: string) => {
    setFormData(prev => ({
      ...prev,
      features: {
        ...prev.features,
        limits: {
          ...prev.features.limits,
          [key]: Number.parseInt(val, 10) || 0
        }
      }
    }));
  };

  const submitButtonText = initialData?.id ? "ACTUALIZAR PLAN" : "CREAR PLAN";

  return (
    <form onSubmit={handleSubmit} className="space-y-6 py-4">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="space-y-2">
          <Text size="sm" weight="bold" className="text-white uppercase tracking-wider">Nombre del Plan</Text>
          <Input
            value={formData.name}
            onChange={(e) => setFormData(p => ({ ...p, name: e.target.value }))}
            placeholder="Ej: Plan Basic, Plan Elite..."
            required
            className="bg-white/5 border-white/10"
          />
        </div>
        <div className="space-y-2">
          <Text size="sm" weight="bold" className="text-white uppercase tracking-wider">Precio Sugerido (USD)</Text>
          <Input
            type="number"
            step="0.01"
            value={formData.monthlyPrice}
            onChange={(e) => setFormData(p => ({ ...p, monthlyPrice: e.target.value }))}
            placeholder="0.00"
            required
            className="bg-white/5 border-white/10"
          />
        </div>
      </div>

      <div className="space-y-2">
        <Text size="sm" weight="bold" className="text-white uppercase tracking-wider">Duración Sugerida (Días)</Text>
        <Input
          type="number"
          value={formData.suggestedDurationDays}
          onChange={(e) => setFormData(p => ({ ...p, suggestedDurationDays: Number.parseInt(e.target.value, 10) || 0 }))}
          className="bg-white/5 border-white/10"
        />
        <Text size="xs" variant="muted">Este valor pre-llenará el formulario de suscripción manual.</Text>
      </div>

      <Separator className="bg-white/10" />

      <div className="space-y-4">
        <div className="flex items-center gap-2 mb-2">
          <Users size={18} className="text-primary" />
          <Text size="sm" weight="bold" className="text-white uppercase tracking-widest">Límites de Uso (0 = Ilimitado)</Text>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Text size="xs" variant="muted" className="uppercase font-bold tracking-widest">Máx. Miembros</Text>
            <Input
              type="number"
              value={formData.features.limits?.members}
              onChange={(e) => updateLimit('members', e.target.value)}
              className="bg-white/5 border-white/10"
            />
          </div>
          <div className="space-y-2">
            <Text size="xs" variant="muted" className="uppercase font-bold tracking-widest">Máx. Coaches</Text>
            <Input
              type="number"
              value={formData.features.limits?.coaches}
              onChange={(e) => updateLimit('coaches', e.target.value)}
              className="bg-white/5 border-white/10"
            />
          </div>
        </div>
      </div>

      <Separator className="bg-white/10" />

      <div className="space-y-4">
        <div className="flex items-center gap-2 mb-2">
          <Globe size={18} className="text-primary" />
          <Text size="sm" weight="bold" className="text-white uppercase tracking-widest">Accesos y Módulos</Text>
        </div>

        <div className="space-y-4 bg-white/5 p-4 rounded-xl border border-white/5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Smartphone size={20} className="text-slate-400" />
              <div>
                <Text size="sm" weight="bold" className="text-slate-200">Acceso a PWA</Text>
                <Text size="xs" variant="muted">Permitir uso de la aplicación móvil.</Text>
              </div>
            </div>
            <Switch
              checked={formData.features.access?.pwa}
              onCheckedChange={(val) => updateFeatureAccess('pwa', val)}
            />
          </div>

          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <BookOpen size={20} className="text-slate-400" />
              <div>
                <Text size="sm" weight="bold" className="text-slate-200">Módulo de Blog</Text>
                <Text size="xs" variant="muted">Habilitar creación de contenido informativo.</Text>
              </div>
            </div>
            <Switch
              checked={formData.features.access?.blog}
              onCheckedChange={(val) => updateFeatureAccess('blog', val)}
            />
          </div>

          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Building2 size={20} className="text-slate-400" />
              <div>
                <Text size="sm" weight="bold" className="text-slate-200">Web Comercial</Text>
                <Text size="xs" variant="muted">Habilitar sitio corporativo personalizable.</Text>
              </div>
            </div>
            <Switch
              checked={formData.features.access?.web_commercial}
              onCheckedChange={(val) => updateFeatureAccess('web_commercial', val)}
            />
          </div>
        </div>
      </div>

      <div className="pt-4">
        <Button
          type="submit"
          variant="primary"
          className="w-full font-black uppercase tracking-widest h-12"
          disabled={isLoading}
        >
          {isLoading ? "Guardando..." : submitButtonText}
        </Button>
      </div>
    </form>
  );
}
