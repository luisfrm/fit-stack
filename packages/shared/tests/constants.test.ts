/**
 * Constants utility tests.
 *
 * Covers: platform subscription status computation, role formatting helpers,
 * and the active/expired predicates — pure functions with no DB dependency.
 */
import { describe, expect, it } from 'vitest';
import {
  computePlatformSubscriptionStatus,
  isPlatformSubscriptionActive,
  isPlatformSubscriptionExpired,
  PLATFORM_SUBSCRIPTION_STATUSES,
  formatOrgRole,
  formatPlatformRole,
  ORG_ROLES,
} from '../src/constants';

// ─── computePlatformSubscriptionStatus ──────────────────────────────────────

describe('computePlatformSubscriptionStatus', () => {
  const now = new Date('2026-06-15T12:00:00Z');

  it('returns "active" when periodEnd is in the future', () => {
    const result = computePlatformSubscriptionStatus({
      currentPeriodEnd: '2026-06-30',
      now,
    });
    expect(result).toBe(PLATFORM_SUBSCRIPTION_STATUSES.ACTIVE);
  });

  it('returns "cancelled" when cancelledAt is set', () => {
    const result = computePlatformSubscriptionStatus({
      currentPeriodEnd: '2026-06-30',
      cancelledAt: '2026-06-10',
      now,
    });
    expect(result).toBe(PLATFORM_SUBSCRIPTION_STATUSES.CANCELLED);
  });

  it('returns "trial" when isTrial is true', () => {
    const result = computePlatformSubscriptionStatus({
      currentPeriodEnd: '2026-05-01', // expired
      isTrial: true,
      now,
    });
    expect(result).toBe(PLATFORM_SUBSCRIPTION_STATUSES.TRIAL);
  });

  it('returns "past_due" when 1-7 days overdue', () => {
    // periodEnd was 3 days ago
    const result = computePlatformSubscriptionStatus({
      currentPeriodEnd: '2026-06-12',
      now,
    });
    expect(result).toBe(PLATFORM_SUBSCRIPTION_STATUSES.PAST_DUE);
  });

  it('returns "read_only" when 8-14 days overdue', () => {
    // periodEnd was 10 days ago
    const result = computePlatformSubscriptionStatus({
      currentPeriodEnd: '2026-06-05',
      now,
    });
    expect(result).toBe(PLATFORM_SUBSCRIPTION_STATUSES.READ_ONLY);
  });

  it('returns "suspended" when 15+ days overdue', () => {
    // periodEnd was 20 days ago
    const result = computePlatformSubscriptionStatus({
      currentPeriodEnd: '2026-05-26',
      now,
    });
    expect(result).toBe(PLATFORM_SUBSCRIPTION_STATUSES.SUSPENDED);
  });

  it('returns "past_due" when hasValidatedPayment is false even if periodEnd is in the future', () => {
    const result = computePlatformSubscriptionStatus({
      currentPeriodEnd: '2026-06-30',
      hasValidatedPayment: false,
      now,
    });
    expect(result).toBe(PLATFORM_SUBSCRIPTION_STATUSES.PAST_DUE);
  });

  it('handles Date objects (not just strings)', () => {
    const result = computePlatformSubscriptionStatus({
      currentPeriodEnd: new Date('2026-07-01'),
      now,
    });
    expect(result).toBe(PLATFORM_SUBSCRIPTION_STATUSES.ACTIVE);
  });
});

// ─── isPlatformSubscriptionActive / isPlatformSubscriptionExpired ────────────

describe('isPlatformSubscriptionActive', () => {
  it('returns true for active', () => {
    expect(isPlatformSubscriptionActive(PLATFORM_SUBSCRIPTION_STATUSES.ACTIVE)).toBe(true);
  });

  it('returns true for trial', () => {
    expect(isPlatformSubscriptionActive(PLATFORM_SUBSCRIPTION_STATUSES.TRIAL)).toBe(true);
  });

  it('returns false for past_due', () => {
    expect(isPlatformSubscriptionActive(PLATFORM_SUBSCRIPTION_STATUSES.PAST_DUE)).toBe(false);
  });

  it('returns false for suspended', () => {
    expect(isPlatformSubscriptionActive(PLATFORM_SUBSCRIPTION_STATUSES.SUSPLETED)).toBe(false);
  });
});

describe('isPlatformSubscriptionExpired', () => {
  it('returns true for past_due', () => {
    expect(isPlatformSubscriptionExpired(PLATFORM_SUBSCRIPTION_STATUSES.PAST_DUE)).toBe(true);
  });

  it('returns true for read_only', () => {
    expect(isPlatformSubscriptionExpired(PLATFORM_SUBSCRIPTION_STATUSES.READ_ONLY)).toBe(true);
  });

  it('returns true for suspended', () => {
    expect(isPlatformSubscriptionExpired(PLATFORM_SUBSCRIPTION_STATUSES.SUSPENDED)).toBe(true);
  });

  it('returns false for active', () => {
    expect(isPlatformSubscriptionExpired(PLATFORM_SUBSCRIPTION_STATUSES.ACTIVE)).toBe(false);
  });

  it('returns false for trial', () => {
    expect(isPlatformSubscriptionExpired(PLATFORM_SUBSCRIPTION_STATUSES.TRIAL)).toBe(false);
  });
});

// ─── formatOrgRole / formatPlatformRole ──────────────────────────────────────

describe('formatOrgRole', () => {
  it('returns Spanish label for known roles', () => {
    expect(formatOrgRole(ORG_ROLES.OWNER)).toBe('Propietario');
    expect(formatOrgRole(ORG_ROLES.MANAGER)).toBe('Gerente');
    expect(formatOrgRole(ORG_ROLES.CASHIER)).toBe('Cajero');
    expect(formatOrgRole(ORG_ROLES.COACH)).toBe('Entrenador');
    expect(formatOrgRole(ORG_ROLES.MEMBER)).toBe('Miembro');
  });

  it('returns "Sin rol" for null/undefined', () => {
    expect(formatOrgRole(null)).toBe('Sin rol');
    expect(formatOrgRole(undefined)).toBe('Sin rol');
  });

  it('capitalizes unknown roles', () => {
    expect(formatOrgRole('custom')).toBe('Custom');
  });
});

describe('formatPlatformRole', () => {
  it('returns Spanish label for known roles', () => {
    expect(formatPlatformRole('owner')).toBe('Propietario');
    expect(formatPlatformRole('admin')).toBe('Administrador');
    expect(formatPlatformRole('support')).toBe('Soporte');
    expect(formatPlatformRole('user')).toBe('Usuario');
  });

  it('returns "Sin rol" for null/undefined', () => {
    expect(formatPlatformRole(null)).toBe('Sin rol');
    expect(formatPlatformRole(undefined)).toBe('Sin rol');
  });
});
