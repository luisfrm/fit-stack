import { describe, expect, it } from 'vitest';
import {
  buildMonthlyCsv,
  hasUnconvertedRevenue,
  lastSixMonths,
  summarizeTodayIncome,
  type MonthlyRevenueRow,
} from '../../lib/dashboard/revenue-summary';

function row(
  month: string,
  normalizedAmount: number,
  currency = 'USD',
  unconvertedAmount = 0,
  unconvertedCount = 0,
): MonthlyRevenueRow {
  return {
    month,
    currency,
    amount: normalizedAmount + unconvertedAmount,
    normalizedAmount,
    unconvertedAmount,
    unconvertedCount,
    originalExchangeRate: null,
  };
}

describe('lastSixMonths', () => {
  it('returns empty for no rows', () => {
    expect(lastSixMonths([])).toEqual([]);
  });

  it('aggregates multi-currency rows of the same month', () => {
    const data = lastSixMonths([
      row('2026-08', 100, 'USD'),
      row('2026-08', 50, 'VES'),
      row('2026-09', 200, 'USD'),
    ]);
    expect(data).toEqual([
      { mes: '2026-08', Monto: 150 },
      { mes: '2026-09', Monto: 200 },
    ]);
  });

  it('keeps only the last 6 buckets in chronological order', () => {
    const rows = ['01', '02', '03', '04', '05', '06', '07', '08'].map((m, i) =>
      row(`2026-${m}`, (i + 1) * 10),
    );
    const data = lastSixMonths(rows);
    expect(data).toHaveLength(6);
    expect(data[0]).toEqual({ mes: '2026-03', Monto: 30 });
    expect(data[5]).toEqual({ mes: '2026-08', Monto: 80 });
  });
});

describe('hasUnconvertedRevenue', () => {
  it('is false when every row is fully normalized', () => {
    expect(hasUnconvertedRevenue([row('2026-09', 200)])).toBe(false);
  });

  it('is true when a row has payments without an exact rate', () => {
    expect(hasUnconvertedRevenue([row('2026-09', 200, 'USD', 5000, 2)])).toBe(true);
  });
});

describe('summarizeTodayIncome', () => {
  it('returns zero for no rows', () => {
    expect(summarizeTodayIncome([], 'USD')).toEqual({
      amount: 0,
      currency: 'USD',
      incomplete: false,
      unconvertedCount: 0,
    });
  });

  it('sums the API-normalized cents and converts to major units', () => {
    expect(
      summarizeTodayIncome(
        [
          {
            currency: 'USD',
            amount: 10000,
            normalizedAmount: 10000,
            unconvertedAmount: 0,
            unconvertedCount: 0,
          },
        ],
        'USD',
      ),
    ).toEqual({
      amount: 100,
      currency: 'USD',
      incomplete: false,
      unconvertedCount: 0,
    });
  });

  it('never presents a partial total as complete', () => {
    expect(
      summarizeTodayIncome(
        [
          {
            currency: 'VES',
            amount: 3650,
            normalizedAmount: 100,
            unconvertedAmount: 0,
            unconvertedCount: 0,
          },
          {
            currency: 'VES',
            amount: 5000,
            normalizedAmount: 0,
            unconvertedAmount: 5000,
            unconvertedCount: 1,
          },
        ],
        'USD',
      ),
    ).toEqual({
      amount: null,
      currency: 'USD',
      incomplete: true,
      unconvertedCount: 1,
    });
  });
});

describe('buildMonthlyCsv', () => {
  it('builds header plus one line per row, including unconverted amounts', () => {
    const csv = buildMonthlyCsv([row('2026-09', 200, 'USD', 5000, 1)], 'USD');
    expect(csv).toBe(
      'mes,moneda,monto,monto_normalizado,no_convertido,pagos_sin_tasa,moneda_base\n' +
        '2026-09,USD,5200,200,5000,1,USD',
    );
  });

  it('builds header only for empty rows', () => {
    expect(buildMonthlyCsv([], 'VES')).toBe(
      'mes,moneda,monto,monto_normalizado,no_convertido,pagos_sin_tasa,moneda_base',
    );
  });
});
