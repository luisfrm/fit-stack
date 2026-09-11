import { describe, expect, it } from 'vitest';
import {
  monthCollectedTotal,
  perActiveSubscription,
} from '../../lib/payments/payment-selectors';

describe('monthCollectedTotal', () => {
  it('returns 0 for no rows', () => {
    expect(monthCollectedTotal([])).toBe(0);
  });

  it('sums only the last month bucket', () => {
    expect(
      monthCollectedTotal([
        { month: '2026-08', normalizedAmount: 100 },
        { month: '2026-09', normalizedAmount: 200 },
        { month: '2026-09', normalizedAmount: 50 },
      ]),
    ).toBe(250);
  });
});

describe('perActiveSubscription', () => {
  it('divides the month total by active subscriptions', () => {
    expect(perActiveSubscription(1000, 4)).toBe(250);
  });

  it('returns null without active subscriptions', () => {
    expect(perActiveSubscription(1000, 0)).toBeNull();
  });
});
