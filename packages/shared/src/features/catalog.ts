/**
 * SaaS plans feature catalog for Fit-Stack.
 * Single source of truth consumed by:
 * - `apps/api-worker` → Zod validation for plans + `requireFeature` middleware + free tier resolver
 * - `apps/console` / `apps/panel` → plans form, free tier settings, sidebar, guards
 *
 * Extension rules (adding a feature MUST NEVER break existing code):
 * - Every new feature starts with `defaultEnabled: false` (additive by default).
 * - Normalizer ignores unknown IDs (tolerant to older payload versions).
 * - `panel` is `alwaysOn` (cannot be disabled).
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
    limits: ['ai_credits_monthly'],
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
  /** Numeric limits per feature; 0 = unlimited */
  limits?: Record<string, number>;
}

export type PlanFeaturesV2 = Partial<Record<FeatureId, FeatureValue>>;

export const FEATURE_CATALOG_VERSION = 1;

const FEATURE_LIMIT_LABELS: Record<string, string> = {
  member_seats: 'Cupos de miembros',
  ai_credits_monthly: 'Créditos IA / mes',
};

function defaultLimits(def: FeatureDefinition): Record<string, number> {
  const limits: Record<string, number> = {};
  for (const limitId of def.limits ?? []) limits[limitId] = 0;
  return limits;
}

/**
 * Normalizes an arbitrary value (API payload, DB JSON or setting) into a
 * valid `PlanFeaturesV2`: ignores unknown features, applies catalog defaults,
 * and validates types (numeric limits, 0 = unlimited).
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

  // Safety: `panel` is alwaysOn — can never be disabled.
  const panel = out.panel;
  if (panel) panel.enabled = true;
  else out.panel = { enabled: true };

  return out;
}

/**
 * Resolves partial/null features applying catalog defaults.
 */
export function resolveFeatures(features?: PlanFeaturesV2 | null): PlanFeaturesV2 {
  return normalizeFeatures(features ?? {});
}

/**
 * Free tier defaults (floor when org has no paid subscription).
 * Overridable from console → Settings → Plan Gratuito
 * (`platform_setting` key `FEATURE_FLAGS_FREE_TIER`).
 */
export const FREE_TIER_FEATURES: PlanFeaturesV2 = {
  panel: { enabled: true },
  members_portal: { enabled: true, limits: { member_seats: 10 } },
  ai_chat: { enabled: true, limits: { ai_credits_monthly: 500 } },
};

export function getFeatureLimits(def: FeatureDefinition): Record<string, number> {
  return defaultLimits(def);
}

export function getFeatureLimitLabel(limitId: string): string {
  return FEATURE_LIMIT_LABELS[limitId] ?? limitId;
}

/**
 * Human-readable text for feature limits, e.g. "5 Mensajes / día · 0 Cupos".
 * `null` if feature has no limits defined.
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
 * Compact summary of a feature set for comparing snapshots, e.g.
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