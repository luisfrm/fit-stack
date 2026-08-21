"use client";

import * as React from "react";
import { Checkbox, Input, Text } from "@workspace/ui/components";
import { Sparkles, Lock } from "lucide-react";
import {
  FEATURE_CATALOG,
  getFeatureLimitLabel,
  type FeatureCatalog,
  type FeatureDefinition,
  type FeatureId,
  type PlanFeaturesV2,
} from "@workspace/shared";
import { cleanNumericInput } from "@/lib/utils/helper";

interface FeaturesEditorProps {
  readonly catalog?: FeatureCatalog;
  readonly features: PlanFeaturesV2;
  readonly onChange: (features: PlanFeaturesV2) => void;
}

/**
 * Editor dinámico de features generado desde el catálogo: toggle `enabled`
 * por feature + inputs numéricos para sus límites (0 = ilimitado).
 * `panel` (alwaysOn) se muestra siempre habilitado y bloqueado.
 */
export function FeaturesEditor({ catalog, features, onChange }: FeaturesEditorProps) {
  const activeCatalog = catalog ?? FEATURE_CATALOG;

  const [drafts, setDrafts] = React.useState<Record<string, string>>(() => {
    const drafts: Record<string, string> = {};
    for (const [id, def] of Object.entries(activeCatalog) as [string, FeatureDefinition][]) {
      for (const limitId of def.limits ?? []) {
        drafts[`${id}:${limitId}`] = (features[id as FeatureId]?.limits?.[limitId] ?? 0).toString();
      }
    }
    return drafts;
  });

  const toggleFeature = (id: FeatureId, enabled: boolean) => {
    onChange({ ...features, [id]: { ...features[id], enabled } });
  };

  const updateLimit = (id: FeatureId, limitId: string, raw: string) => {
    const key = `${id}:${limitId}`;
    const processed = cleanNumericInput(drafts[key] ?? "0", raw);
    setDrafts((prev) => ({ ...prev, [key]: processed }));

    const parsed = Number.parseInt(processed, 10);
    onChange({
      ...features,
      [id]: {
        ...features[id],
        enabled: features[id]?.enabled ?? false,
        limits: { ...features[id]?.limits, [limitId]: Number.isFinite(parsed) ? parsed : 0 },
      },
    });
  };

  return (
    <div className="space-y-1.5">
      <div className="flex items-baseline justify-between gap-2 px-0.5">
        <div className="flex items-center gap-1.5">
          <Sparkles size={14} className="text-primary" />
          <Text size="xs" weight="bold" className="uppercase tracking-[0.14em] text-foreground">
            Features
          </Text>
          <span className="hidden sm:inline text-[11px] text-foreground-muted">· 0 = ilimitado</span>
        </div>
        <Text size="xs" variant="muted" className="hidden sm:block">
          {Object.keys(activeCatalog).length} módulos
        </Text>
      </div>

      {/* Lista plana con divisores — sin cards anidadas */}
      <div className="divide-y divide-border-muted">
        {(Object.entries(activeCatalog) as [string, FeatureDefinition][]).map(([id, def]) => {
          const featureId = id as FeatureId;
          const value = features[featureId];
          const enabled = value?.enabled ?? def.defaultEnabled;
          const isLocked = def.alwaysOn === true;

          return (
            <div key={id} className="py-3">
              <div className="flex items-start gap-2.5">
                <Checkbox
                  id={`feature-${id}`}
                  checked={enabled}
                  disabled={isLocked}
                  onCheckedChange={(val) => !isLocked && toggleFeature(featureId, val === true)}
                  className="mt-0.5"
                />
                <button
                  type="button"
                  disabled={isLocked}
                  onClick={() => !isLocked && toggleFeature(featureId, !enabled)}
                  className="min-w-0 flex-1 cursor-pointer select-none rounded-md text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/20 disabled:cursor-default"
                >
                  <span className="block text-[13px] font-semibold text-foreground">
                    {def.label}
                    {isLocked && (
                      <span className="ml-2 inline-flex items-center gap-1 align-middle text-[10px] font-bold uppercase tracking-widest text-primary">
                        <Lock size={10} /> Always on
                      </span>
                    )}
                  </span>
                  {!isLocked && def.limits && def.limits.length > 0 && (
                    <span className="block text-xs text-foreground-muted">
                      {def.limits.length} límite(s) · 0 = ilimitado
                    </span>
                  )}
                  {isLocked && (
                    <span className="block text-xs text-foreground-muted">Siempre habilitado en todos los planes.</span>
                  )}
                </button>
              </div>

              {enabled && def.limits && def.limits.length > 0 && (
                <div className="mt-3 grid grid-cols-2 sm:grid-cols-3 gap-3">
                  {def.limits.map((limitId) => (
                    <Input
                      key={limitId}
                      label={getFeatureLimitLabel(limitId)}
                      type="number"
                      min="0"
                      value={drafts[`${id}:${limitId}`] ?? "0"}
                      onChange={(e) => updateLimit(featureId, limitId, e.target.value)}
                      placeholder="0"
                    />
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
      <Text size="xs" variant="muted" className="px-0.5 pt-1">
        Desactivar una feature oculta el módulo (downgrade = hide) sin borrar datos.
      </Text>
    </div>
  );
}