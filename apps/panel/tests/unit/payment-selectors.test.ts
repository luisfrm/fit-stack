import { describe, expect, it } from 'vitest';
import {
  monthCollectedTotal,
  perActiveSubscription,
} from '../../lib/payments/payment-selectors';

describe('monthCollectedTotal', () => {
  it('returns null for no rows (nothing to show)', () => {
    expect(monthCollectedTotal([])).toBeNull();
  });

  it('sums only the last month bucket', () => {
    expect(
      monthCollectedTotal([
        { month: '2026-08', normalizedAmount: 100, unconvertedAmount: 0 },
        { month: '2026-09', normalizedAmount: 200, unconvertedAmount: 0 },
        { month: '2026-09', normalizedAmount: 50, unconvertedAmount: 0 },
      ]),
    ).toBe(250);
  });

  it('returns null when the last month has unconverted payments', () => {
    expect(
      monthCollectedTotal([
        { month: '2026-09', normalizedAmount: 200, unconvertedAmount: 0 },
        { month: '2026-09', normalizedAmount: 0, unconvertedAmount: 5000 },
      ]),
    ).toBeNull();
  });
});

describe('perActiveSubscription', () => {
  it('divides the month total by active subscriptions', () => {
    expect(perActiveSubscription(1000, 4)).toBe(250);
  });

  it('returns null without a complete month total', () => {
    expect(perActiveSubscription(null, 4)).toBeNull();
  });

  it('returns null without active subscriptions', () => {
    expect(perActiveSubscription(1000, 0)).toBeNull();
  });
});
