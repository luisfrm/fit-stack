/**
 * Unit tests for the feature catalog (single source of truth for SaaS plan
 * features, free tier defaults and resolution/normalization helpers).
 */
import { describe, expect, it } from 'vitest';
import {
  FEATURE_CATALOG,
  FEATURE_CATALOG_VERSION,
  FREE_TIER_FEATURES,
  normalizeFeatures,
  resolveFeatures,
  getFeatureLimits,
  getFeatureLimitLabel,
  formatFeatureLimits,
  summarizeFeatures,
} from '../src/features/catalog';

describe('FEATURE_CATALOG', () => {
  it('defines the 5 known features', () => {
    expect(Object.keys(FEATURE_CATALOG).sort()).toEqual([
      'ai_chat',
      'blog',
      'cms',
      'members_portal',
      'panel',
    ]);
    expect(FEATURE_CATALOG_VERSION).toBe(1);
  });

  it('panel is alwaysOn', () => {
    expect(FEATURE_CATALOG.panel.alwaysOn).toBe(true);
    expect(FEATURE_CATALOG.panel.defaultEnabled).toBe(true);
  });

  it('members_portal and ai_chat declare their limits', () => {
    expect(FEATURE_CATALOG.members_portal.limits).toEqual(['member_seats']);
    expect(FEATURE_CATALOG.ai_chat.limits).toEqual([
      'ai_messages_daily',
      'ai_messages_weekly',
      'ai_messages_monthly',
    ]);
  });
});

describe('normalizeFeatures', () => {
  it('applies catalog defaults to empty input', () => {
    const f = normalizeFeatures({});
    expect(f.panel.enabled).toBe(true);
    expect(f.cms.enabled).toBe(false);
    expect(f.ai_chat?.limits?.ai_messages_daily).toBe(0);
  });

  it('ignores unknown feature ids', () => {
    const f = normalizeFeatures({ not_a_feature: { enabled: true } });
    expect(f.not_a_feature).toBeUndefined();
  });

  it('preserves explicit limits and enabled flags', () => {
    const f = normalizeFeatures({
      ai_chat: { enabled: true, limits: { ai_messages_daily: 5 } },
      members_portal: { enabled: false, limits: { member_seats: 3 } },
    });
    expect(f.ai_chat?.enabled).toBe(true);
    expect(f.ai_chat?.limits?.ai_messages_daily).toBe(5);
    expect(f.ai_chat?.limits?.ai_messages_weekly).toBe(0);
    expect(f.members_portal?.enabled).toBe(false);
  });

  it('rejects non-numeric limits (defaults to 0)', () => {
    const f = normalizeFeatures({
      ai_chat: { enabled: true, limits: { ai_messages_daily: 'cinco' as unknown as number } },
    });
    expect(f.ai_chat?.limits?.ai_messages_daily).toBe(0);
  });

  it('panel can never be disabled (alwaysOn safety)', () => {
    const f = normalizeFeatures({ panel: { enabled: false } });
    expect(f.panel.enabled).toBe(true);
  });

  it('tolerates garbage input', () => {
    const f = normalizeFeatures(null);
    expect(f.panel.enabled).toBe(true);
    expect(f.cms.enabled).toBe(false);
  });
});

describe('resolveFeatures', () => {
  it('resolves null/undefined to defaults', () => {
    expect(resolveFeatures(null).panel.enabled).toBe(true);
    expect(resolveFeatures(undefined).cms.enabled).toBe(false);
  });
});

describe('FREE_TIER_FEATURES', () => {
  it('is the documented floor: panel + portal (10 seats) + ai chat (5/day)', () => {
    expect(FREE_TIER_FEATURES.panel?.enabled).toBe(true);
    expect(FREE_TIER_FEATURES.members_portal?.enabled).toBe(true);
    expect(FREE_TIER_FEATURES.members_portal?.limits?.member_seats).toBe(10);
    expect(FREE_TIER_FEATURES.ai_chat?.enabled).toBe(true);
    expect(FREE_TIER_FEATURES.ai_chat?.limits?.ai_messages_daily).toBe(5);
    expect(FREE_TIER_FEATURES.ai_chat?.limits?.ai_messages_weekly).toBe(0);
    expect(FREE_TIER_FEATURES.ai_chat?.limits?.ai_messages_monthly).toBe(0);
  });
});

describe('helpers', () => {
  it('getFeatureLimits returns zeroed defaults', () => {
    expect(getFeatureLimits(FEATURE_CATALOG.members_portal)).toEqual({ member_seats: 0 });
  });

  it('getFeatureLimitLabel falls back to the raw id', () => {
    expect(getFeatureLimitLabel('member_seats')).toBe('Cupos de miembros');
    expect(getFeatureLimitLabel('unknown_limit')).toBe('unknown_limit');
  });

  it('formatFeatureLimits renders readable text (0 = ilimitado)', () => {
    expect(
      formatFeatureLimits({ enabled: true, limits: { ai_messages_daily: 5, ai_messages_weekly: 0 } }),
    ).toBe('Mensajes / día: 5 · Mensajes / semana: Ilimitado');
    expect(formatFeatureLimits({ enabled: true })).toBeNull();
    expect(formatFeatureLimits(undefined)).toBeNull();
  });

  it('summarizeFeatures includes every catalog feature with state', () => {
    const summary = summarizeFeatures({ panel: { enabled: true }, cms: { enabled: true } });
    expect(summary).toContain('Panel de Administración: Sí');
    expect(summary).toContain('CMS (contenido/páginas): Sí');
    expect(summary).toContain('Blog: No');
  });
});