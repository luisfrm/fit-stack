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
  PAYMENT_STATUSES,
  QUALIFYING_PAYMENT_STATUSES,
  getVoidKind,
  formatOrgRole,
  formatPlatformRole,
  ORG_ROLES,
} from '../src/constants';

// ─── computePlatformSubscriptionStatus ──────────────────────────────────────

describe('computePlatformSubscriptionStatus', () => {
  const now = new Date('2026-06-15T12:00:00Z');

  it('returns "active" when periodEnd is in the future and there is a qualifying payment', () => {
    const result = computePlatformSubscriptionStatus({
      currentPeriodEnd: '2026-06-30',
      hasValidatedPayment: true,
      now,
    });
    expect(result).toBe(PLATFORM_SUBSCRIPTION_STATUSES.ACTIVE);
  });

  it('returns "cancelled" when cancelledAt is set', () => {
    const result = computePlatformSubscriptionStatus({
      currentPeriodEnd: '2026-06-30',
      cancelledAt: '2026-06-10',
      hasValidatedPayment: true,
      now,
    });
    expect(result).toBe(PLATFORM_SUBSCRIPTION_STATUSES.CANCELLED);
  });

  it('returns "trial" while the trial period is still active', () => {
    const result = computePlatformSubscriptionStatus({
      currentPeriodEnd: '2026-06-30',
      isTrial: true,
      hasValidatedPayment: false,
      now,
    });
    expect(result).toBe(PLATFORM_SUBSCRIPTION_STATUSES.TRIAL);
  });

  it('expired trial falls into the standard grace ladder (not "trial")', () => {
    const result = computePlatformSubscriptionStatus({
      currentPeriodEnd: '2026-06-14', // 1 day overdue
      isTrial: true,
      hasValidatedPayment: false,
      now,
    });
    expect(result).toBe(PLATFORM_SUBSCRIPTION_STATUSES.PAST_DUE);
  });

  it('returns "past_due" when 1-7 days overdue', () => {
    const result = computePlatformSubscriptionStatus({
      currentPeriodEnd: '2026-06-12', // 3 days ago
      hasValidatedPayment: true,
      now,
    });
    expect(result).toBe(PLATFORM_SUBSCRIPTION_STATUSES.PAST_DUE);
  });

  it('returns "read_only" when 8-14 days overdue', () => {
    const result = computePlatformSubscriptionStatus({
      currentPeriodEnd: '2026-06-05', // 10 days ago
      hasValidatedPayment: true,
      now,
    });
    expect(result).toBe(PLATFORM_SUBSCRIPTION_STATUSES.READ_ONLY);
  });

  it('returns "suspended" when 15+ days overdue', () => {
    const result = computePlatformSubscriptionStatus({
      currentPeriodEnd: '2026-05-26', // 20 days ago
      hasValidatedPayment: true,
      now,
    });
    expect(result).toBe(PLATFORM_SUBSCRIPTION_STATUSES.SUSPENDED);
  });

  it('returns "past_due" when there is no qualifying payment even if periodEnd is in the future', () => {
    // Cubre el pago `processing` y el `voided` (ninguno califica).
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
      hasValidatedPayment: true,
      now,
    });
    expect(result).toBe(PLATFORM_SUBSCRIPTION_STATUSES.ACTIVE);
  });

  it('grace boundary at exactly 7 days is past_due and 8 is read_only', () => {
    expect(
      computePlatformSubscriptionStatus({
        currentPeriodEnd: '2026-06-08', // 7 days ago
        hasValidatedPayment: true,
        now,
      })
    ).toBe(PLATFORM_SUBSCRIPTION_STATUSES.PAST_DUE);
    expect(
      computePlatformSubscriptionStatus({
        currentPeriodEnd: '2026-06-07', // 8 days ago
        hasValidatedPayment: true,
        now,
      })
    ).toBe(PLATFORM_SUBSCRIPTION_STATUSES.READ_ONLY);
  });

  it('grace boundary at exactly 14 days is read_only and 15 is suspended', () => {
    expect(
      computePlatformSubscriptionStatus({
        currentPeriodEnd: '2026-06-01', // 14 days ago
        hasValidatedPayment: true,
        now,
      })
    ).toBe(PLATFORM_SUBSCRIPTION_STATUSES.READ_ONLY);
    expect(
      computePlatformSubscriptionStatus({
        currentPeriodEnd: '2026-05-31', // 15 days ago
        hasValidatedPayment: true,
        now,
      })
    ).toBe(PLATFORM_SUBSCRIPTION_STATUSES.SUSPENDED);
  });

  it('trial only holds while its period has not elapsed', () => {
    // Mismo instante = todavía vigente (el chequeo es `end >= now`).
    expect(
      computePlatformSubscriptionStatus({
        currentPeriodEnd: '2026-06-15T12:00:00.000Z',
        isTrial: true,
        hasValidatedPayment: false,
        now,
      })
    ).toBe(PLATFORM_SUBSCRIPTION_STATUSES.TRIAL);
    // Un día vencido ya cae en la escalera de gracia, no en trial.
    expect(
      computePlatformSubscriptionStatus({
        currentPeriodEnd: '2026-06-14T12:00:00.000Z',
        isTrial: true,
        hasValidatedPayment: false,
        now,
      })
    ).toBe(PLATFORM_SUBSCRIPTION_STATUSES.PAST_DUE);
  });
});

describe('payment status helpers', () => {
  it('PAYMENT_STATUSES is exactly processing/validated/voided/refunded (no legacy pending/invalid)', () => {
    expect(PAYMENT_STATUSES).toEqual({
      PROCESSING: 'processing',
      VALIDATED: 'validated',
      VOIDED: 'voided',
      REFUNDED: 'refunded',
    });
    expect(Object.values(PAYMENT_STATUSES)).not.toContain('pending');
    expect(Object.values(PAYMENT_STATUSES)).not.toContain('invalid');
  });

  it('qualifying statuses are exactly validated and refunded', () => {
    expect([...QUALIFYING_PAYMENT_STATUSES]).toEqual([
      PAYMENT_STATUSES.VALIDATED,
      PAYMENT_STATUSES.REFUNDED,
    ]);
    expect(QUALIFYING_PAYMENT_STATUSES).not.toContain(PAYMENT_STATUSES.PROCESSING);
    expect(QUALIFYING_PAYMENT_STATUSES).not.toContain(PAYMENT_STATUSES.VOIDED);
  });

  it('getVoidKind derives rejected vs annulled from the receipt number', () => {
    expect(getVoidKind({ receiptNumber: null })).toBe('rejected');
    expect(getVoidKind({})).toBe('rejected');
    expect(getVoidKind({ receiptNumber: undefined })).toBe('rejected');
    expect(getVoidKind({ receiptNumber: 'fit-stack-2026-000045' })).toBe('annulled');
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
    expect(isPlatformSubscriptionActive(PLATFORM_SUBSCRIPTION_STATUSES.SUSPENDED)).toBe(false);
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
