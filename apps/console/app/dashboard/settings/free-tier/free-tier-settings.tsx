"use client";

import * as React from "react";
import { Gift, Info, AlertCircle } from "lucide-react";
import { Text } from "@workspace/ui/components/text";
import { Button } from "@workspace/ui/components/button";
import { Badge } from "@workspace/ui/components/badge";
import { Title, toast } from "@workspace/ui";
import { PLATFORM_SETTINGS_KEYS } from "@/lib/config/platform-settings";
import { api } from "@/lib/api/client";
import { FeaturesEditor } from "@/components/platform/features-editor";
import {
  FREE_TIER_FEATURES,
  resolveFeatures,
  type FeatureCatalog,
  type PlanFeaturesV2,
} from "@workspace/shared";
import { useRouter } from "next/navigation";

interface FreeTierSettingsProps {
  readonly initialSettings: Record<string, string>;
  readonly catalog: FeatureCatalog;
  readonly onSaved?: () => void | Promise<void>;
}

export function FreeTierSettings({ initialSettings, catalog, onSaved }: FreeTierSettingsProps) {
  const router = useRouter();
  const raw = initialSettings[PLATFORM_SETTINGS_KEYS.FEATURE_FLAGS_FREE_TIER];
  const isConfigured = !!raw;

  const [features, setFeatures] = React.useState<PlanFeaturesV2>(() => {
    if (!raw) return resolveFeatures(FREE_TIER_FEATURES);
    try {
      return resolveFeatures(JSON.parse(raw) as PlanFeaturesV2);
    } catch {
      return resolveFeatures(FREE_TIER_FEATURES);
    }
  });
  const [isUpdating, setIsUpdating] = React.useState(false);

  const handleSave = async () => {
    setIsUpdating(true);
    try {
      await api("/platform/settings", {
        method: "POST",
        body: {
          [PLATFORM_SETTINGS_KEYS.FEATURE_FLAGS_FREE_TIER]: JSON.stringify(features),
        },
      });
      toast.success("Plan Gratuito actualizado correctamente");
      await onSaved?.();
      router.refresh();
    } catch (error) {
      console.error("Error saving free tier features:", error);
      toast.error("Error al guardar el Plan Gratuito");
    } finally {
      setIsUpdating(false);
    }
  };

  const handleDisable = async () => {
    setIsUpdating(true);
    try {
      await api("/platform/settings", {
        method: "POST",
        body: {
          [PLATFORM_SETTINGS_KEYS.FEATURE_FLAGS_FREE_TIER]: "",
        },
      });
      toast.success("Plan Gratuito desactivado");
      await onSaved?.();
      router.refresh();
    } catch (error) {
      console.error("Error disabling free tier:", error);
      toast.error("Error al desactivar el Plan Gratuito");
    } finally {
      setIsUpdating(false);
    }
  };

  return (
    <div className="pb-20 animate-in fade-in slide-in-from-bottom-2 duration-500 max-w-4xl">
      {/* Header — sin card, con divisor */}
      <div className="flex flex-col gap-4 border-b border-border-muted pb-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="space-y-1.5 min-w-0 max-w-[58ch]">
            <Title as="h1" size="card" className="tracking-tight text-[22px] font-bold">
              Plan Gratuito
            </Title>
            <Text variant="muted" className="text-[13px] leading-relaxed">
              Piso que reciben las orgs sin suscripción pagada. Es un setting de plataforma, no un plan del catálogo. Downgrade = hide.
            </Text>
          </div>
          {isConfigured ? (
            <Badge variant="success" size="md" className="uppercase tracking-widest shrink-0">
              Configurado
            </Badge>
          ) : (
            <Badge variant="warning" size="md" className="uppercase tracking-widest shrink-0">
              No configurado
            </Badge>
          )}
        </div>
        <p className="flex gap-2 text-xs leading-relaxed text-foreground-muted">
          <AlertCircle className="size-3.5 text-foreground-dim shrink-0 mt-0.5" />
          <span>
            {isConfigured
              ? "Las orgs sin suscripción entran al panel con estas features. Módulos sin feature se ocultan, los datos no se tocan."
              : "Sin configurar, las orgs sin suscripción quedan bloqueadas (legado)."}
          </span>
        </p>
      </div>

      {/* Editor — sección plana con header + lista, sin card-en-card */}
      <section className="mt-8 overflow-hidden rounded-xl border border-border bg-surface">
        <div className="flex items-center gap-3 border-b border-border-muted bg-surface-2/40 px-4 py-3">
          <span className="inline-flex size-7 items-center justify-center rounded-lg bg-primary/10 border border-primary/20">
            <Gift className="size-3.5 text-primary" />
          </span>
          <span className="text-sm font-bold">Módulos del piso gratuito</span>
          <span className="ml-auto hidden sm:inline text-xs text-foreground-muted">0 = ilimitado</span>
        </div>
        <div className="p-4">
          <FeaturesEditor catalog={catalog} features={features} onChange={setFeatures} />
        </div>
      </section>

      {/* Acciones — barra distinta, no otra Card idéntica */}
      <div className="mt-6 flex flex-col gap-3 border-t border-border-muted pt-6 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex gap-2 text-xs leading-relaxed text-foreground-muted max-w-[44ch]">
          <Info className="size-3.5 text-foreground-dim shrink-0 mt-0.5" />
          <span>Se aplica al instante a todas las orgs sin suscripción pagada. No genera suscripciones ni aparece en el catálogo.</span>
        </div>
        <div className="flex flex-col-reverse sm:flex-row gap-2 sm:items-center shrink-0">
          {isConfigured && (
            <Button variant="outlined" onClick={handleDisable} disabled={isUpdating} className="w-full sm:w-auto">
              Desactivar
            </Button>
          )}
          <Button onClick={handleSave} loading={isUpdating} className="w-full sm:w-auto px-8 h-11 text-sm font-bold uppercase tracking-[0.08em]">
            Guardar Plan Gratuito
          </Button>
        </div>
      </div>
    </div>
  );
}