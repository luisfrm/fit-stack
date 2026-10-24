/**
 * Revenue normalization contracts.
 *
 * `exchange_rate_applied` reads "1 {plan_snapshot_currency} = rate
 * {currency_paid}" (the same semantic used by the receipt composer). Since
 * RD-157 the base amount of a gym payment is its frozen `plan_snapshot_price`
 * (the server priced the charge from the plan), so revenue endpoints never
 * divide by the rate when the plan is already in the primary currency; the
 * division survives only as the historical fallback, and rows whose plan is
 * in a third currency stay explicitly unconverted — never assumed 1:1.
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
import { createGymMember, createGymTenant, createPlan, isoDate, localDay } from '../helpers/auth';
import { withRateServer } from '../helpers/rates';

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
      planPrice: number;
      amountPaid: number;
      currencyPaid: string;
      exchangeRateApplied: string | null;
    }) => {
      await testQuery(
        `INSERT INTO payment
           (organization_id, member_id, plan_snapshot_name, plan_snapshot_price,
            plan_snapshot_currency, amount_paid, currency_paid,
            exchange_rate_applied, status, payment_method, payment_date)
         VALUES ($1, $2, 'Plan histórico', $3, $4, $5, $6, $7,
            'validated', 'cash', NOW())`,
        [
          organization.id,
          member.id,
          values.planPrice,
          values.planCurrency,
          values.amountPaid,
          values.currencyPaid,
          values.exchangeRateApplied,
        ],
      );
    };

    // VES payments against a USD plan: the base amount is the FROZEN plan
    // price, never the rounded division (RD-157). Two rows prove the sum is
    // taken per payment, not from the aggregate.
    await insertPayment({
      planCurrency: 'USD',
      planPrice: 10000,
      amountPaid: 3650,
      currencyPaid: 'VES',
      exchangeRateApplied: '36.5',
    });
    await insertPayment({
      planCurrency: 'USD',
      planPrice: 10000,
      amountPaid: 3650,
      currencyPaid: 'VES',
      exchangeRateApplied: '36.5',
    });
    // No rate at all: with the plan in the primary currency the base amount
    // is still exact (the plan price), so it is NOT dumped into unconverted.
    await insertPayment({
      planCurrency: 'USD',
      planPrice: 25000,
      amountPaid: 912500,
      currencyPaid: 'VES',
      exchangeRateApplied: null,
    });
    // Already in the primary currency: normalized as-is.
    await insertPayment({
      planCurrency: 'USD',
      planPrice: 10000,
      amountPaid: 10000,
      currencyPaid: 'USD',
      exchangeRateApplied: null,
    });
    // A spurious rate on a primary-currency payment must NOT divide it.
    await insertPayment({
      planCurrency: 'USD',
      planPrice: 70000,
      amountPaid: 700,
      currencyPaid: 'USD',
      exchangeRateApplied: '36.5',
    });
    // Plan currency (EUR) differs from primary (USD): the rate only reaches
    // EUR, and the historical EUR→USD hop is not persisted. Unconverted.
    await insertPayment({
      planCurrency: 'EUR',
      planPrice: 9000,
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

    // 10000 + 10000 (USD plans paid in VES) + 25000 (no rate, exact plan
    // price) + 10000 (USD) + 700 (primary currency, never divided).
    expect(normalized).toBe(55700);
    // 9000 EUR whose plan is not the primary currency.
    expect(unconverted).toBe(9000);
    expect(unconvertedCount).toBe(1);

    // The plan priced in the primary currency is normalized from the plan
    // price even without a rate, never treated as 1:1.
    const vesNoRate = todayRows.find(
      (row) => row.currency === 'VES' && row.originalExchangeRate === null,
    );
    expect(vesNoRate).toEqual(
      expect.objectContaining({
        amount: 912500,
        normalizedAmount: 25000,
        unconvertedAmount: 0,
        unconvertedCount: 0,
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
    expect(monthlyNormalized).toBe(55700);
    expect(monthlyUnconverted).toBe(9000);
  });

  it('stores the exact rate and books the plan price as base amount (RD-157)', async () => {
    const { owner, organization } = await createGymTenant('rev-precision');

    // A COP gym: the plan is priced in COP and the member pays in USD. The
    // quote 1 COP = 0.00025 USD is exactly what numeric(10,4) could not hold
    // (it stored 0.0003, a 20% error on every division).
    await testQuery(
      `UPDATE organization SET primary_currency = 'COP' WHERE id = $1`,
      [organization.id],
    );

    const member = await createGymMember(owner.client);
    const plan = await createPlan(owner.client, { price: 40000, currency: 'COP' });

    const subscription = await withRateServer({ USD: 0.00025 }, async (url) => {
      owner.client.env.EXCHANGE_API_URL = url;
      return owner.client.post('/api/subscriptions', {
        memberId: member.id,
        planId: plan.id,
        startDate: isoDate(0),
        endDate: isoDate(30),
        payment: {
          currencyPaid: 'USD',
          paymentMethod: 'cash',
          paymentMethodDetails: [],
          status: 'validated',
          paymentDate: isoDate(0),
        },
      });
    });
    expect(subscription.status, subscription.text).toBe(201);

    const [payment] = await testQuery<{
      id: number;
      amount_paid: string;
      exchange_rate_applied: string;
      plan_snapshot_price: string;
    }>(
      `SELECT id, amount_paid, exchange_rate_applied::text AS exchange_rate_applied,
              plan_snapshot_price
         FROM payment WHERE subscription_id = $1`,
      [subscription.body.id],
    );

    // 40000 COP cents * 0.00025 = 10 USD cents; the rate keeps all 10 decimals.
    expect(Number(payment!.amount_paid)).toBe(10);
    expect(payment!.exchange_rate_applied).toBe('0.0002500000');

    // Report: the base amount is the frozen plan price, not 10 / 0.0003.
    const analytics = await owner.client.get('/api/payments/analytics');
    expect(analytics.status, analytics.text).toBe(200);
    const todayRows = (analytics.body.chartData as Array<{
      day: string;
      currency: string;
      normalizedAmount: number;
      unconvertedAmount: number;
    }>).filter((row) => row.day === localDay(0, 'America/Caracas'));
    const usd = todayRows.find((row) => row.currency === 'USD');
    expect(usd?.normalizedAmount).toBe(40000);
    expect(usd?.unconvertedAmount).toBe(0);

    // Receipt: the compose reads the same exact base amount. The PDF is not
    // rendered here; persisting the key is enough for the read contract.
    await testQuery(`UPDATE payment SET receipt_pdf_key = 'test/receipt.pdf' WHERE id = $1`, [
      payment!.id,
    ]);
    const receipt = await owner.client.get(`/api/payments/${payment!.id}/receipt`);
    expect(receipt.status, receipt.text).toBe(200);
    const amounts = receipt.body.receipt.amounts as {
      baseCurrency: string;
      baseTotal: number | null;
      currencyPaid: string;
    };
    expect(amounts.currencyPaid).toBe('USD');
    expect(amounts.baseCurrency).toBe('COP');
    expect(amounts.baseTotal).toBe(40000);
    // The rounded-rate division would have produced this ~17% error.
    expect(amounts.baseTotal).not.toBe(33333);
  });

  it('VES plan paid in USD books the frozen VES plan price as base (RD-157)', async () => {
    // The default tenant is a VES gym: the plan currency and the primary
    // currency match, so the base amount is the plan price even though the
    // member pays in USD.
    const { owner } = await createGymTenant('rev-ves-usd');

    const member = await createGymMember(owner.client);
    const plan = await createPlan(owner.client, { price: 40000, currency: 'VES' });

    const subscription = await withRateServer({ USD: 0.0025 }, async (url) => {
      owner.client.env.EXCHANGE_API_URL = url;
      return owner.client.post('/api/subscriptions', {
        memberId: member.id,
        planId: plan.id,
        startDate: isoDate(0),
        endDate: isoDate(30),
        payment: {
          currencyPaid: 'USD',
          paymentMethod: 'cash',
          paymentMethodDetails: [],
          status: 'validated',
          paymentDate: isoDate(0),
        },
      });
    });
    expect(subscription.status, subscription.text).toBe(201);

    const [payment] = await testQuery<{
      amount_paid: string;
      exchange_rate_applied: string;
    }>(
      `SELECT amount_paid, exchange_rate_applied::text AS exchange_rate_applied
         FROM payment WHERE subscription_id = $1`,
      [subscription.body.id],
    );

    // 40000 VES cents * 0.0025 = 100 USD cents; the rate keeps every decimal.
    expect(Number(payment!.amount_paid)).toBe(100);
    expect(payment!.exchange_rate_applied).toBe('0.0025000000');

    // Report: the base amount is the frozen VES plan price, never 100 / 0.0025.
    // The tenant is fresh, so its only payment is the one just booked.
    const analytics = await owner.client.get('/api/payments/analytics');
    expect(analytics.status, analytics.text).toBe(200);
    const usd = (analytics.body.chartData as Array<{
      currency: string;
      normalizedAmount: number;
      unconvertedAmount: number;
    }>).find((row) => row.currency === 'USD');
    expect(usd?.normalizedAmount).toBe(40000);
    expect(usd?.unconvertedAmount).toBe(0);
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
      // The frozen plan price, not 3650 / 36.5 (rounding-prone).
      normalizedAmount: 10000,
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
