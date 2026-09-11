import { describe, expect, it } from 'vitest';
import {
  buildMonthlyCsv,
  lastSixMonths,
  type MonthlyRevenueRow,
} from '../../lib/dashboard/revenue-summary';

function row(month: string, normalizedAmount: number, currency = 'USD'): MonthlyRevenueRow {
  return { month, currency, amount: normalizedAmount, normalizedAmount, originalExchangeRate: '1' };
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

describe('buildMonthlyCsv', () => {
  it('builds header plus one line per row', () => {
    const csv = buildMonthlyCsv([row('2026-09', 200, 'USD')], 'USD');
    expect(csv).toBe(
      'mes,moneda,monto,monto_normalizado,moneda_base\n2026-09,USD,200,200,USD',
    );
  });

  it('builds header only for empty rows', () => {
    expect(buildMonthlyCsv([], 'VES')).toBe('mes,moneda,monto,monto_normalizado,moneda_base');
  });
});
