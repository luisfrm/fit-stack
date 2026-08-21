/**
 * Catálogo de features de los planes SaaS de Fit-Stack.
 * Fuente de verdad única (single source of truth) consumida por:
 * - `apps/api-worker` → validación Zod de planes + middleware `requireFeature` + resolver free tier
 * - `apps/console` / `apps/panel` → form de planes, free tier settings, sidebar, guards
 *
 * Reglas de extensión (agregar una feature NUNCA debe romper nada):
 * - Toda feature nueva nace con `defaultEnabled: false` (aditivo por defecto).
 * - El normalizador ignora IDs desconocidos (tolerante a versiones viejas).
 * - `panel` es `alwaysOn` (no puede desactivarse).
 */

export const FEATURE_CATALOG = {
  panel: {
    kind: 'boolean',
    defaultEnabled: true,
    alwaysOn: true,
    label: 'Panel de Administración',
  },
  cms: { kind: 'boolean', defaultEnabled: false, label: 'CMS (contenido/páginas)' },
  blog: { kind: 'boolean', defaultEnabled: false, label: 'Blog' },
  members_portal: {
    kind: 'boolean',
    defaultEnabled: false,
    limits: ['member_seats'],
    label: 'Portal de Miembros',
  },
  ai_chat: {
    kind: 'boolean',
    defaultEnabled: false,
    limits: ['ai_messages_daily', 'ai_messages_weekly', 'ai_messages_monthly'],
    label: 'Chat IA',
  },
} as const;

export type FeatureId = keyof typeof FEATURE_CATALOG;

export interface FeatureDefinition {
  kind: 'boolean';
  defaultEnabled: boolean;
  alwaysOn?: boolean;
  label: string;
  limits?: readonly string[];
}

export type FeatureCatalog = Record<string, FeatureDefinition>;

export interface FeatureValue {
  enabled: boolean;
  /** Límites numéricos por feature; 0 = ilimitado */
  limits?: Record<string, number>;
}

export type PlanFeaturesV2 = Partial<Record<FeatureId, FeatureValue>>;

export const FEATURE_CATALOG_VERSION = 1;

const FEATURE_LIMIT_LABELS: Record<string, string> = {
  member_seats: 'Cupos de miembros',
  ai_messages_daily: 'Mensajes / día',
  ai_messages_weekly: 'Mensajes / semana',
  ai_messages_monthly: 'Mensajes / mes',
};

function defaultLimits(def: FeatureDefinition): Record<string, number> {
  const limits: Record<string, number> = {};
  for (const limitId of def.limits ?? []) limits[limitId] = 0;
  return limits;
}

/**
 * Normaliza un valor arbitrario (payload de API, JSON de DB o setting) a un
 * `PlanFeaturesV2` válido: ignora features desconocidas, aplica los defaults
 * del catálogo y valida tipos (límites numéricos, 0 = ilimitado).
 */
export function normalizeFeatures(raw: unknown): PlanFeaturesV2 {
  const out: PlanFeaturesV2 = {};
  const source = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};

  for (const [id, def] of Object.entries(FEATURE_CATALOG) as [FeatureId, FeatureDefinition][]) {
    const entry = source[id];
    const enabled =
      entry && typeof entry === 'object' && typeof (entry as Record<string, unknown>).enabled === 'boolean'
        ? ((entry as Record<string, unknown>).enabled as boolean)
        : def.defaultEnabled;

    const limits = defaultLimits(def);
    const rawLimits =
      entry && typeof entry === 'object' ? (entry as Record<string, unknown>).limits : undefined;
    if (rawLimits && typeof rawLimits === 'object') {
      for (const limitId of def.limits ?? []) {
        const v = (rawLimits as Record<string, unknown>)[limitId];
        if (typeof v === 'number' && Number.isFinite(v)) limits[limitId] = v;
      }
    }

    out[id as FeatureId] = def.limits?.length ? { enabled, limits } : { enabled };
  }

  // Seguridad: `panel` es alwaysOn — nunca puede quedar deshabilitado.
  const panel = out.panel;
  if (panel) panel.enabled = true;
  else out.panel = { enabled: true };

  return out;
}

/**
 * Resuelve features parciales/nulas aplicando los defaults del catálogo.
 */
export function resolveFeatures(features?: PlanFeaturesV2 | null): PlanFeaturesV2 {
  return normalizeFeatures(features ?? {});
}

/**
 * Defaults del free tier (piso cuando la org no tiene suscripción pagada).
 * Se puede overridear desde console → Settings → Plan Gratuito
 * (`platform_setting` key `FEATURE_FLAGS_FREE_TIER`).
 */
export const FREE_TIER_FEATURES: PlanFeaturesV2 = {
  panel: { enabled: true },
  members_portal: { enabled: true, limits: { member_seats: 10 } },
  ai_chat: {
    enabled: true,
    limits: { ai_messages_daily: 5, ai_messages_weekly: 0, ai_messages_monthly: 0 },
  },
};

export function getFeatureLimits(def: FeatureDefinition): Record<string, number> {
  return defaultLimits(def);
}

export function getFeatureLimitLabel(limitId: string): string {
  return FEATURE_LIMIT_LABELS[limitId] ?? limitId;
}

/**
 * Texto legible de los límites de una feature, ej. "5 Mensajes / día · 0 Cupos".
 * `null` si la feature no tiene límites definidos.
 */
export function formatFeatureLimits(value: FeatureValue | undefined): string | null {
  if (!value?.limits) return null;
  const parts = Object.entries(value.limits).map(([limitId, v]) => {
    const label = FEATURE_LIMIT_LABELS[limitId] ?? limitId;
    return v === 0 ? `${label}: Ilimitado` : `${label}: ${v}`;
  });
  return parts.length ? parts.join(' · ') : null;
}

/**
 * Resumen compacto de un set de features para comparar snapshots, ej.
 * "Panel de Administración: Sí · CMS: No · ...".
 */
export function summarizeFeatures(features: PlanFeaturesV2 | null | undefined): string {
  const resolved = resolveFeatures(features);
  return (Object.entries(FEATURE_CATALOG) as [FeatureId, FeatureDefinition][])
    .map(([id, def]) => {
      const value = resolved[id as FeatureId];
      const limits = value?.limits
        ? ` (${Object.values(value.limits).map((n) => (n === 0 ? '∞' : n)).join('/')})`
        : '';
      return `${def.label}: ${value?.enabled ? 'Sí' : 'No'}${limits}`;
    })
    .join(' · ');
}