import { describe, expect, it } from 'vitest';
import {
  FEATURE_CATALOG,
  FREE_TIER_FEATURES,
  formatFeatureLimits,
  getFeatureLimitLabel,
  normalizeFeatures,
  resolveFeatures,
  summarizeFeatures,
  type PlanFeaturesV2,
} from '@workspace/shared';

describe('normalizeFeatures', () => {
  it('fills catalog defaults for empty input', () => {
    const result = normalizeFeatures({});
    expect(result.panel?.enabled).toBe(true);
    expect(result.cms?.enabled).toBe(false);
    expect(result.ai_chat?.enabled).toBe(false);
    expect(result.ai_chat?.limits).toEqual({
      ai_credits_monthly: 0,
    });
  });

  it('keeps provided values and sanitizes invalid ones', () => {
    const result = normalizeFeatures({
      cms: { enabled: true },
      ai_chat: { enabled: true, limits: { ai_credits_monthly: 1500, ai_messages_daily: 5 as unknown as number } },
    });
    expect(result.cms?.enabled).toBe(true);
    expect(result.ai_chat?.enabled).toBe(true);
    expect(result.ai_chat?.limits?.ai_credits_monthly).toBe(1500);
  });

  it('ignores non-object input', () => {
    const result = normalizeFeatures(null);
    expect(result.panel?.enabled).toBe(true);
    expect(result.cms?.enabled).toBe(false);
  });

  it('always includes every catalog feature', () => {
    const result = normalizeFeatures({});
    expect(Object.keys(result).sort()).toEqual(Object.keys(FEATURE_CATALOG).sort());
  });
});

describe('resolveFeatures', () => {
  it('returns catalog defaults for null/undefined (panel only on)', () => {
    const defaults = normalizeFeatures({});
    expect(resolveFeatures(null)).toEqual(defaults);
    expect(resolveFeatures(undefined)).toEqual(defaults);
    expect(defaults.panel?.enabled).toBe(true);
    expect(defaults.members_portal?.enabled).toBe(false);
  });

  it('merges partial features with defaults', () => {
    const result = resolveFeatures({ blog: { enabled: true } });
    expect(result.blog?.enabled).toBe(true);
    expect(result.panel?.enabled).toBe(true);
    expect(result.members_portal?.enabled).toBe(false);
  });
});

describe('FREE_TIER_FEATURES', () => {
  it('enables panel + members_portal + ai_chat (the real free floor)', () => {
    expect(FREE_TIER_FEATURES.panel?.enabled).toBe(true);
    expect(FREE_TIER_FEATURES.members_portal?.enabled).toBe(true);
    expect(FREE_TIER_FEATURES.ai_chat?.enabled).toBe(true);
    for (const id of ['cms', 'blog'] as const) {
      expect(FREE_TIER_FEATURES[id]?.enabled).not.toBe(true);
    }
  });

  it('has the documented floor limits', () => {
    expect(FREE_TIER_FEATURES.members_portal?.limits?.member_seats).toBe(10);
    expect(FREE_TIER_FEATURES.ai_chat?.limits?.ai_credits_monthly).toBe(500);
  });
});

describe('formatFeatureLimits', () => {
  it('returns null when the feature has no limits', () => {
    expect(formatFeatureLimits({ enabled: true })).toBeNull();
  });

  it('formats limits with labels and unlimited marker', () => {
    const text = formatFeatureLimits({
      enabled: true,
      limits: { ai_credits_monthly: 1500 },
    });
    expect(text).toContain('Créditos IA / mes: 1500');
    const unlimited = formatFeatureLimits({
      enabled: true,
      limits: { ai_credits_monthly: 0 },
    });
    expect(unlimited).toContain('Créditos IA / mes: Ilimitado');
  });
});

describe('getFeatureLimitLabel', () => {
  it('returns the label for known limits and the raw id otherwise', () => {
    expect(getFeatureLimitLabel('member_seats')).toBe('Cupos de miembros');
    expect(getFeatureLimitLabel('unknown_limit')).toBe('unknown_limit');
  });
});

describe('summarizeFeatures', () => {
  it('produces a comparable summary including limits', () => {
    const a: PlanFeaturesV2 = { cms: { enabled: true } };
    const b: PlanFeaturesV2 = { cms: { enabled: true }, ai_chat: { enabled: true, limits: { ai_credits_monthly: 1000 } } };
    expect(summarizeFeatures(a)).not.toBe(summarizeFeatures(b));
    expect(summarizeFeatures(a)).toContain('CMS (contenido/páginas): Sí');
  });

  it('is stable for equal inputs', () => {
    const a: PlanFeaturesV2 = { cms: { enabled: true } };
    const b: PlanFeaturesV2 = { cms: { enabled: true } };
    expect(summarizeFeatures(a)).toBe(summarizeFeatures(b));
  });
});