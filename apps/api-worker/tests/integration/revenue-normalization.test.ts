/**
 * Revenue normalization contracts.
 *
 * `exchange_rate_applied` reads "1 {plan_snapshot_currency} = rate
 * {currency_paid}" (the same semantic used by the receipt composer).
 * Revenue endpoints must normalize with that PERSISTED rate — never with a
 * live rate and never assuming 1 when it is missing.
 *
 * Standard pattern: real HTTP + Neon branch (`TEST_DATABASE_URL`), graceful
 * skip without the variable, `truncateAll` per file.
 */
import { beforeAll, describe, expect, it } from 'vitest';
import { createClient } from '../helpers/client';
import {
  assertSchemaReady,
  skipReason,
  testQuery,
  truncateAll,
} from '../helpers/db';
import { createGymMember, createGymTenant, localDay } from '../helpers/auth';

describe.skipIf(skipReason !== null)('Revenue normalization', () => {
  beforeAll(async () => {
    await assertSchemaReady();
    await truncateAll();
  });

  it('normalizes with the persisted rate and reports unconverted rows explicitly', async () => {
    const { owner, organization } = await createGymTenant('rev-normalize');

    // Default org is VES; make USD the primary so a USD plan is the exact
    // one-hop case the reports must normalize. Direct SQL keeps this contract
    // test independent from settings storage drift in the shared test branch.
    await testQuery(
      `UPDATE organization SET primary_currency = 'USD' WHERE id = $1`,
      [organization.id],
    );

    const member = await createGymMember(owner.client);

    const insertPayment = async (values: {
      planCurrency: string;
      amountPaid: number;
      currencyPaid: string;
      exchangeRateApplied: string | null;
    }) => {
      await testQuery(
        `INSERT INTO payment
           (organization_id, member_id, plan_snapshot_name, plan_snapshot_price,
            plan_snapshot_currency, amount_paid, currency_paid,
            exchange_rate_applied, status, payment_method, payment_date)
         VALUES ($1, $2, 'Plan histórico', 10000, $3, $4, $5, $6,
            'validated', 'cash', NOW())`,
        [
          organization.id,
          member.id,
          values.planCurrency,
          values.amountPaid,
          values.currencyPaid,
          values.exchangeRateApplied,
        ],
      );
    };

    // VES payments against a USD plan: the persisted rate is exact.
    // Two small payments prove rounding is PER PAYMENT: round(100/36.5)=3
    // each (6 total), not round(200/36.5)=5.
    await insertPayment({
      planCurrency: 'USD',
      amountPaid: 100,
      currencyPaid: 'VES',
      exchangeRateApplied: '36.5',
    });
    await insertPayment({
      planCurrency: 'USD',
      amountPaid: 100,
      currencyPaid: 'VES',
      exchangeRateApplied: '36.5',
    });
    // No rate: cannot be normalized, must NEVER be treated as 1:1.
    await insertPayment({
      planCurrency: 'USD',
      amountPaid: 5000,
      currencyPaid: 'VES',
      exchangeRateApplied: null,
    });
    // Already in the primary currency: normalized as-is.
    await insertPayment({
      planCurrency: 'USD',
      amountPaid: 10000,
      currencyPaid: 'USD',
      exchangeRateApplied: null,
    });
    // A spurious rate on a primary-currency payment must NOT divide it.
    await insertPayment({
      planCurrency: 'USD',
      amountPaid: 700,
      currencyPaid: 'USD',
      exchangeRateApplied: '36.5',
    });
    // Plan currency (EUR) differs from primary (USD): the rate only reaches
    // EUR, and the historical EUR→USD hop is not persisted. Unconverted.
    await insertPayment({
      planCurrency: 'EUR',
      amountPaid: 9000,
      currencyPaid: 'EUR',
      exchangeRateApplied: '0.9',
    });

    const today = localDay(0, 'America/Caracas');

    const analytics = await owner.client.get('/api/payments/analytics');
    expect(analytics.status, analytics.text).toBe(200);
    const chartData = analytics.body.chartData as Array<{
      day: string;
      currency: string;
      amount: number;
      normalizedAmount: number;
      unconvertedAmount: number;
      unconvertedCount: number;
      originalExchangeRate: string | null;
    }>;

    // Contract shape.
    expect(chartData[0]).toEqual(
      expect.objectContaining({
        day: expect.any(String),
        currency: expect.any(String),
        amount: expect.any(Number),
        normalizedAmount: expect.any(Number),
        unconvertedAmount: expect.any(Number),
        unconvertedCount: expect.any(Number),
      }),
    );

    const todayRows = chartData.filter((row) => row.day === today);
    const normalized = todayRows.reduce((acc, row) => acc + row.normalizedAmount, 0);
    const unconverted = todayRows.reduce((acc, row) => acc + row.unconvertedAmount, 0);
    const unconvertedCount = todayRows.reduce(
      (acc, row) => acc + row.unconvertedCount,
      0,
    );

    // 6 (VES with rate, rounded per payment) + 10000 + 700 (primary currency).
    expect(normalized).toBe(10706);
    // 5000 VES without rate + 9000 EUR whose plan is not the primary currency.
    expect(unconverted).toBe(14000);
    expect(unconvertedCount).toBe(2);

    // The no-rate VES group is explicitly unconverted, never normalized to 1.
    const vesNoRate = todayRows.find(
      (row) => row.currency === 'VES' && row.originalExchangeRate === null,
    );
    expect(vesNoRate).toEqual(
      expect.objectContaining({
        amount: 5000,
        normalizedAmount: 0,
        unconvertedAmount: 5000,
        unconvertedCount: 1,
      }),
    );

    // Same contract on the monthly report.
    const revenue = await owner.client.get('/api/reports/revenue');
    expect(revenue.status, revenue.text).toBe(200);
    const monthlyRows = revenue.body as Array<{
      month: string;
      currency: string;
      amount: number;
      normalizedAmount: number;
      unconvertedAmount: number;
      unconvertedCount: number;
      originalExchangeRate: string | null;
    }>;
    expect(monthlyRows[0]).toEqual(
      expect.objectContaining({
        month: expect.any(String),
        currency: expect.any(String),
        amount: expect.any(Number),
        normalizedAmount: expect.any(Number),
        unconvertedAmount: expect.any(Number),
        unconvertedCount: expect.any(Number),
      }),
    );

    const monthlyNormalized = monthlyRows.reduce(
      (acc, row) => acc + row.normalizedAmount,
      0,
    );
    const monthlyUnconverted = monthlyRows.reduce(
      (acc, row) => acc + row.unconvertedAmount,
      0,
    );
    expect(monthlyNormalized).toBe(10706);
    expect(monthlyUnconverted).toBe(14000);
  });

  it('keeps today revenue consistent with the chart and flags incomplete totals', async () => {
    const { owner, organization } = await createGymTenant('rev-today');
    await testQuery(
      `UPDATE organization SET primary_currency = 'USD' WHERE id = $1`,
      [organization.id],
    );

    const member = await createGymMember(owner.client);
    await testQuery(
      `INSERT INTO payment
         (organization_id, member_id, plan_snapshot_name, plan_snapshot_price,
          plan_snapshot_currency, amount_paid, currency_paid,
          exchange_rate_applied, status, payment_method, payment_date)
       VALUES ($1, $2, 'Plan', 10000, 'USD', 3650, 'VES', '36.5',
          'validated', 'cash', NOW())`,
      [organization.id, member.id],
    );

    const res = await owner.client.get('/api/payments/analytics');
    expect(res.status, res.text).toBe(200);
    const todayRevenue = res.body.kpis.todayRevenue as Array<{
      currency: string;
      amount: number;
      normalizedAmount: number;
      unconvertedAmount: number;
      unconvertedCount: number;
    }>;

    const ves = todayRevenue.find((row) => row.currency === 'VES');
    expect(ves).toEqual({
      currency: 'VES',
      amount: 3650,
      normalizedAmount: 100,
      unconvertedAmount: 0,
      unconvertedCount: 0,
    });
    expect(ves?.normalizedAmount).not.toBe(3650);
  });

  it('requires REPORTS read permission (contract guard)', async () => {
    const { organization } = await createGymTenant('rev-rbac');
    const anonymous = createClient();
    const res = await anonymous.get('/api/reports/revenue', {
      query: { organizationId: organization.id },
    });
    expect(res.status).toBe(401);
  });
});
