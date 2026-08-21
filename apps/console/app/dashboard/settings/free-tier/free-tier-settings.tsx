"use client";

import * as React from "react";
import { Gift, Info, AlertCircle } from "lucide-react";
import { Text } from "@workspace/ui/components/text";
import { Button } from "@workspace/ui/components/button";
import { Switch } from "@workspace/ui/components/switch";
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
  const isEnabled =
    initialSettings[PLATFORM_SETTINGS_KEYS.FEATURE_FLAGS_FREE_TIER_ENABLED] === "true";

  const [features, setFeatures] = React.useState<PlanFeaturesV2>(() => {
    if (!raw) return resolveFeatures(FREE_TIER_FEATURES);
    try {
      return resolveFeatures(JSON.parse(raw) as PlanFeaturesV2);
    } catch {
      return resolveFeatures(FREE_TIER_FEATURES);
    }
  });
  const [enabled, setEnabled] = React.useState(isEnabled);
  const [isUpdating, setIsUpdating] = React.useState(false);

  const saveSettings = async (body: Record<string, string>) => {
    await api("/platform/settings", {
      method: "POST",
      body,
    });
  };

  const handleToggleEnabled = async (next: boolean) => {
    setIsUpdating(true);
    try {
      const body: Record<string, string> = {
        [PLATFORM_SETTINGS_KEYS.FEATURE_FLAGS_FREE_TIER_ENABLED]: next ? "true" : "false",
      };
      // Al habilitar, persistimos las features (si aún no había config, defaults de código)
      if (next) {
        body[PLATFORM_SETTINGS_KEYS.FEATURE_FLAGS_FREE_TIER] = JSON.stringify(features);
      }
      await saveSettings(body);
      setEnabled(next);
      toast.success(next ? "Plan Gratuito habilitado" : "Plan Gratuito deshabilitado");
      await onSaved?.();
      router.refresh();
    } catch (error) {
      console.error("Error toggling free tier:", error);
      toast.error("Error al cambiar el estado del Plan Gratuito");
    } finally {
      setIsUpdating(false);
    }
  };

  const handleSave = async () => {
    setIsUpdating(true);
    try {
      const body: Record<string, string> = {
        [PLATFORM_SETTINGS_KEYS.FEATURE_FLAGS_FREE_TIER]: JSON.stringify(features),
      };
      if (!enabled) {
        body[PLATFORM_SETTINGS_KEYS.FEATURE_FLAGS_FREE_TIER_ENABLED] = "true";
      }
      await saveSettings(body);
      setEnabled(true);
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
              Piso que reciben las orgs sin suscripción pagada. Es un setting de plataforma, no un
              plan del catálogo. Downgrade = hide.
            </Text>
          </div>

          <label
            htmlFor="free-tier-enabled"
            className="flex items-center gap-3 rounded-lg border border-border bg-surface px-3 py-2 cursor-pointer select-none"
          >
            <span className="flex flex-col">
              <span className="text-sm font-semibold leading-tight">Free tier habilitado</span>
              <span className="text-xs text-foreground-muted leading-tight">
                {enabled ? "Las orgs sin suscripción entran al panel" : "Las orgs sin suscripción quedan bloqueadas"}
              </span>
            </span>
            <Switch
              id="free-tier-enabled"
              checked={enabled}
              disabled={isUpdating}
              onCheckedChange={(val) => handleToggleEnabled(val === true)}
            />
          </label>
        </div>

        <p className="flex gap-2 text-xs leading-relaxed text-foreground-muted">
          <AlertCircle className="size-3.5 text-foreground-dim shrink-0 mt-0.5" />
          <span>
            {enabled
              ? "Las orgs sin suscripción entran con estas features. Módulos sin feature se ocultan, los datos no se tocan."
              : "Deshabilitado: las orgs sin suscripción quedan bloqueadas (comportamiento legado)."}
          </span>
        </p>
      </div>

      {/* Editor — sección plana con header + lista, sin card-en-card */}
      <section
        className={`mt-8 overflow-hidden rounded-xl border transition-opacity ${
          enabled ? "border-border bg-surface" : "border-border-muted bg-surface/60"
        }`}
      >
        <div className="flex items-center gap-3 border-b border-border-muted bg-surface-2/40 px-4 py-3">
          <span className="inline-flex size-7 items-center justify-center rounded-lg bg-primary/10 border border-primary/20">
            <Gift className="size-3.5 text-primary" />
          </span>
          <span className="text-sm font-bold">Módulos del piso gratuito</span>
          {!enabled && (
            <span className="ml-auto hidden sm:inline text-xs text-foreground-muted">
              Habilitá el free tier para editarlos
            </span>
          )}
        </div>
        <div className={`p-4 ${!enabled ? "pointer-events-none opacity-60" : ""}`}>
          <FeaturesEditor catalog={catalog} features={features} onChange={setFeatures} />
        </div>
      </section>

      {/* Acciones — barra distinta, no otra Card idéntica */}
      <div className="mt-6 flex flex-col gap-3 border-t border-border-muted pt-6 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex gap-2 text-xs leading-relaxed text-foreground-muted max-w-[44ch]">
          <Info className="size-3.5 text-foreground-dim shrink-0 mt-0.5" />
          <span>Se aplica al instante a todas las orgs sin suscripción pagada. No genera suscripciones ni aparece en el catálogo.</span>
        </div>
        <Button
          onClick={handleSave}
          loading={isUpdating}
          className="w-full sm:w-auto px-8 h-11 text-sm font-bold uppercase tracking-[0.08em]"
        >
          Guardar Plan Gratuito
        </Button>
      </div>
    </div>
  );
}
