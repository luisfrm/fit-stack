import { describe, expect, it } from 'vitest';
import { filterNavItemsByFeatures } from '../../lib/features/nav-filter';
import { isQuotaExhausted, formatQuotaLabel } from '../../lib/features/quota';
import { resolveFeatures, type PlanFeaturesV2 } from '@workspace/shared';

describe('filterNavItemsByFeatures', () => {
  const items = [
    { label: 'Dashboard', href: '/dashboard' },
    { label: 'Contenido', href: '/dashboard/content', feature: 'cms' },
    { label: 'Chat IA', href: '/dashboard/chat', feature: 'ai_chat' },
  ] as const;

  it('keeps items without feature and hides disabled/missing features', () => {
    const features: PlanFeaturesV2 = { cms: { enabled: true } };
    const result = filterNavItemsByFeatures(items, features);
    expect(result.map((i) => i.label)).toEqual(['Dashboard', 'Contenido']);
  });

  it('shows items whose feature is enabled', () => {
    const features: PlanFeaturesV2 = { cms: { enabled: true }, ai_chat: { enabled: true } };
    const result = filterNavItemsByFeatures(items, features);
    expect(result.map((i) => i.label)).toEqual(['Dashboard', 'Contenido', 'Chat IA']);
  });

  it('keeps all items when features are unavailable (defensive pass-through)', () => {
    const result = filterNavItemsByFeatures(items, null);
    expect(result.map((i) => i.label)).toEqual(['Dashboard', 'Contenido', 'Chat IA']);
  });

  it('treats a missing feature key as disabled', () => {
    const result = filterNavItemsByFeatures(items, {});
    expect(result.map((i) => i.label)).toEqual(['Dashboard']);
  });
});

describe('resolveFeatures', () => {
  it('fills catalog defaults', () => {
    const resolved = resolveFeatures({ cms: { enabled: true } });
    expect(resolved.cms?.enabled).toBe(true);
    expect(resolved.panel?.enabled).toBe(true);
    expect(resolved.ai_chat?.enabled).toBe(false);
    expect(resolved.ai_chat?.limits?.ai_messages_daily).toBe(0);
  });
});

describe('isQuotaExhausted', () => {
  it('is exhausted only when limit > 0 and used >= limit', () => {
    expect(isQuotaExhausted({ used: 5, limit: 5 })).toBe(true);
    expect(isQuotaExhausted({ used: 6, limit: 5 })).toBe(true);
    expect(isQuotaExhausted({ used: 4, limit: 5 })).toBe(false);
    expect(isQuotaExhausted({ used: 99, limit: 0 })).toBe(false);
    expect(isQuotaExhausted(null)).toBe(false);
    expect(isQuotaExhausted(undefined)).toBe(false);
  });
});

describe('formatQuotaLabel', () => {
  it('formats used/limit with infinity for unlimited', () => {
    expect(formatQuotaLabel({ used: 5, limit: 5 })).toBe('5/5');
    expect(formatQuotaLabel({ used: 3, limit: 0 })).toBe('3/∞');
    expect(formatQuotaLabel(null)).toBe('—');
  });
});