"use client";

import * as React from "react";
import { CheckboxCard, Input, Text } from "@workspace/ui/components";
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
    <div className="space-y-3">
      <div className="flex items-baseline justify-between gap-2">
        <div className="flex items-center gap-2">
          <Sparkles size={16} className="text-primary" />
          <Text size="xs" weight="bold" className="uppercase tracking-[0.14em] text-foreground">
            Features
          </Text>
          <span className="hidden sm:inline text-[11px] text-foreground-muted">· 0 = ilimitado</span>
        </div>
        <Text size="xs" variant="muted" className="hidden sm:block">
          {Object.keys(activeCatalog).length} módulos
        </Text>
      </div>

      {/* Lista plana con divisores — sin card-en-card */}
      <div className="overflow-hidden rounded-xl border border-border bg-surface">
        {(Object.entries(activeCatalog) as [string, FeatureDefinition][]).map(([id, def], idx) => {
          const featureId = id as FeatureId;
          const value = features[featureId];
          const enabled = value?.enabled ?? def.defaultEnabled;
          const isLocked = def.alwaysOn === true;

          return (
            <div
              key={id}
              className={`px-4 py-3.5 ${idx !== 0 ? "border-t border-border-muted" : ""} ${enabled ? "bg-surface" : "bg-surface-2/40"} transition-colors`}
            >
              <div className="flex items-start gap-3">
                <CheckboxCard
                  id={`feature-${id}`}
                  checked={enabled}
                  onCheckedChange={(val) => !isLocked && toggleFeature(featureId, val)}
                  label={def.label}
                  description={isLocked ? "Siempre habilitado." : def.limits ? `${def.limits.length} límite(s)` : undefined}
                  className="flex-1 min-w-0 [&_label]:text-[13px] [&_p]:text-xs"
                />
                {isLocked ? (
                  <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 border border-primary/20 px-2.5 py-1 text-[10px] font-bold uppercase tracking-widest text-primary shrink-0">
                    <Lock size={10} /> Always on
                  </span>
                ) : (
                  <span className={`hidden sm:inline-flex rounded-full border px-2 py-1 text-[10px] font-bold uppercase tracking-widest shrink-0 ${enabled ? "bg-success/10 border-success/20 text-success" : "bg-surface-2 border-border text-foreground-muted"}`}>
                    {enabled ? "Activo" : "Off"}
                  </span>
                )}
              </div>

              {enabled && def.limits && def.limits.length > 0 && (
                <div className="mt-3 grid grid-cols-2 sm:grid-cols-3 gap-3 border-t border-border-muted pt-3">
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
      <Text size="xs" variant="muted" className="px-1">
        Panel es permanente. Desactivar una feature oculta el módulo (downgrade = hide) sin borrar datos.
      </Text>
    </div>
  );
}