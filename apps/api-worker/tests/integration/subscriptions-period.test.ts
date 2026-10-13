/**
 * Server-authoritative period.
 *
 * `POST /api/subscriptions` computes the cumulative period (Rule 4):
 * `startDate`/`endDate` are optional; an explicit `endDate` only requires a
 * reason when it shortens an active period; `endDate < startDate` is rejected.
 * All money in integer cents; the tz is injected by `requireOrgTimezone()`.
 */
import { beforeAll, describe, expect, it } from 'vitest';
import { assertSchemaReady, skipReason, testQuery, truncateAll } from '../helpers/db';
import {
  createGymTenant,
  createGymMember,
  createPlan,
  isoDate,
  localDay,
  type GymTenant,
} from '../helpers/auth';
import { addDuration, toLocalDayString, type DurationUnit } from '@workspace/shared';

const TZ = 'America/Caracas';
const AMOUNT_CENTS = 10000;

interface CreatedSub {
  id: number;
  startDate: string;
  endDate: string;
  endDateOverrideReason: string | null;
}

describe.skipIf(skipReason !== null)('Subscriptions period (fase 4 / B3.3)', () => {
  beforeAll(async () => {
    await assertSchemaReady();
    await truncateAll();
  });

  /** Tenant with member + plan of the given duration (price in cents). */
  async function setupFixture(
    tenant: GymTenant,
    durationValue = 1,
    durationUnit: DurationUnit = 'month',
  ) {
    const member = await createGymMember(tenant.owner.client);
    const plan = await createPlan(tenant.owner.client, {
      price: AMOUNT_CENTS,
      currency: 'USD',
      durationValue,
      durationUnit,
    });
    return { member, plan };
  }

  function payment(extra: Record<string, unknown> = {}) {
    return {
      amountPaid: AMOUNT_CENTS,
      currencyPaid: 'USD',
      paymentMethod: 'cash',
      paymentMethodDetails: [],
      status: 'validated',
      paymentDate: isoDate(0),
      ...extra,
    };
  }

  describe('(a) sin fechas → periodo = inicio + duración', () => {
    const cases: Array<{ value: number; unit: DurationUnit }> = [
      { value: 1, unit: 'month' },
      { value: 1, unit: 'week' },
      { value: 1, unit: 'day' },
    ];
    for (const { value, unit } of cases) {
      it(`plan ${value} ${unit}: inicio = hoy local y fin = inicio + duración`, async () => {
        const tenant = await createGymTenant(`period-a-${unit}`);
        const { member, plan } = await setupFixture(tenant, value, unit);

        const res = await tenant.owner.client.post<CreatedSub>('/api/subscriptions', {
          memberId: member.id,
          planId: plan.id,
          payment: payment(),
        });
        expect(res.status, res.text).toBe(201);

        expect(toLocalDayString(TZ, new Date(res.body.startDate))).toBe(
          toLocalDayString(TZ, new Date()),
        );
        const expectedEnd = toLocalDayString(
          TZ,
          addDuration(new Date(res.body.startDate), value, unit, TZ),
        );
        expect(toLocalDayString(TZ, new Date(res.body.endDate))).toBe(expectedEnd);
        expect(res.body.endDateOverrideReason).toBeNull();
      });
    }
  });

  it('(b) renovación sobre vigente → acumula desde latest.endDate aunque startDate sea hoy', async () => {
    const tenant = await createGymTenant('period-b');
    const { member, plan } = await setupFixture(tenant);

    const first = await tenant.owner.client.post<CreatedSub>('/api/subscriptions', {
      memberId: member.id,
      planId: plan.id,
      payment: payment(),
    });
    expect(first.status, first.text).toBe(201);

    const second = await tenant.owner.client.post<CreatedSub>('/api/subscriptions', {
      memberId: member.id,
      planId: plan.id,
      startDate: localDay(0, TZ),
      payment: payment(),
    });
    expect(second.status, second.text).toBe(201);

    // The start is today, but the end accumulates from the period in force.
    expect(toLocalDayString(TZ, new Date(second.body.startDate))).toBe(
      toLocalDayString(TZ, new Date()),
    );
    const expectedEnd = toLocalDayString(
      TZ,
      addDuration(new Date(first.body.endDate), 1, 'month', TZ),
    );
    expect(toLocalDayString(TZ, new Date(second.body.endDate))).toBe(expectedEnd);
    expect(new Date(second.body.endDate).getTime()).toBeGreaterThan(
      new Date(first.body.endDate).getTime(),
    );
    expect(second.body.endDateOverrideReason).toBeNull();
  });

  it('(c) periodo vencido → baseline = startDate (no acumula)', async () => {
    const tenant = await createGymTenant('period-c');
    const { member, plan } = await setupFixture(tenant);

    const first = await tenant.owner.client.post<CreatedSub>('/api/subscriptions', {
      memberId: member.id,
      planId: plan.id,
      startDate: isoDate(-60),
      payment: payment(),
    });
    expect(first.status, first.text).toBe(201);

    const second = await tenant.owner.client.post<CreatedSub>('/api/subscriptions', {
      memberId: member.id,
      planId: plan.id,
      payment: payment(),
    });
    expect(second.status, second.text).toBe(201);

    // Baseline = today: the end is computed from the start, not from the expired one.
    const expectedEnd = toLocalDayString(
      TZ,
      addDuration(new Date(second.body.startDate), 1, 'month', TZ),
    );
    expect(toLocalDayString(TZ, new Date(second.body.endDate))).toBe(expectedEnd);
    expect(toLocalDayString(TZ, new Date(second.body.endDate))).not.toBe(
      toLocalDayString(TZ, addDuration(new Date(first.body.endDate), 1, 'month', TZ)),
    );
  });

  it('(d) endDate que acorta sin motivo → 422 con code (ausente o solo espacios)', async () => {
    const tenant = await createGymTenant('period-d');
    const { member, plan } = await setupFixture(tenant);

    const first = await tenant.owner.client.post<CreatedSub>('/api/subscriptions', {
      memberId: member.id,
      planId: plan.id,
      payment: payment(),
    });
    expect(first.status, first.text).toBe(201);

    const shortened = {
      memberId: member.id,
      planId: plan.id,
      startDate: localDay(0, TZ),
      endDate: localDay(5, TZ),
      payment: payment(),
    };
    const res = await tenant.owner.client.post('/api/subscriptions', shortened);
    expect(res.status, res.text).toBe(422);
    expect(res.body).toMatchObject({ code: 'END_DATE_OVERRIDE_REASON_REQUIRED' });

    const blank = await tenant.owner.client.post('/api/subscriptions', {
      ...shortened,
      endDateOverrideReason: '   ',
    });
    expect(blank.status, blank.text).toBe(422);
    expect(blank.body).toMatchObject({ code: 'END_DATE_OVERRIDE_REASON_REQUIRED' });
  });

  it('(e) con motivo → 201 y motivo persistido (relectura del repo)', async () => {
    const tenant = await createGymTenant('period-e');
    const { member, plan } = await setupFixture(tenant);

    const first = await tenant.owner.client.post<CreatedSub>('/api/subscriptions', {
      memberId: member.id,
      planId: plan.id,
      payment: payment(),
    });
    expect(first.status, first.text).toBe(201);

    const reason = 'Ajuste acordado con el cliente';
    const res = await tenant.owner.client.post<CreatedSub>('/api/subscriptions', {
      memberId: member.id,
      planId: plan.id,
      startDate: localDay(0, TZ),
      endDate: localDay(5, TZ),
      endDateOverrideReason: reason,
      payment: payment(),
    });
    expect(res.status, res.text).toBe(201);

    // The explicit endDate is used and the reason is persisted.
    expect(toLocalDayString(TZ, new Date(res.body.endDate))).toBe(localDay(5, TZ));
    expect(res.body.endDateOverrideReason).toBe(reason);

    const rows = await testQuery<{ end_date_override_reason: string | null }>(
      `SELECT end_date_override_reason FROM subscription WHERE id = $1`,
      [res.body.id],
    );
    expect(rows[0]?.end_date_override_reason).toBe(reason);
  });

  it('(f) endDate < startDate → 422 con code', async () => {
    const tenant = await createGymTenant('period-f');
    const { member, plan } = await setupFixture(tenant);

    const res = await tenant.owner.client.post('/api/subscriptions', {
      memberId: member.id,
      planId: plan.id,
      startDate: localDay(10, TZ),
      endDate: localDay(5, TZ),
      payment: payment(),
    });
    expect(res.status, res.text).toBe(422);
    expect(res.body).toMatchObject({ code: 'END_DATE_BEFORE_START' });
  });

  it('(g) endDate = calculado con periodo vigente → 201 sin motivo (idempotente)', async () => {
    const tenant = await createGymTenant('period-g');
    const { member, plan } = await setupFixture(tenant);

    const first = await tenant.owner.client.post<CreatedSub>('/api/subscriptions', {
      memberId: member.id,
      planId: plan.id,
      payment: payment(),
    });
    expect(first.status, first.text).toBe(201);

    // Renewal that sends exactly the computed end (cumulative): it does not
    // shorten anything → it does not require a reason and does not persist one.
    const second = await tenant.owner.client.post<CreatedSub>('/api/subscriptions', {
      memberId: member.id,
      planId: plan.id,
      startDate: localDay(0, TZ),
      endDate: toLocalDayString(
        TZ,
        addDuration(new Date(first.body.endDate), 1, 'month', TZ),
      ),
      payment: payment(),
    });
    expect(second.status, second.text).toBe(201);
    expect(second.body.endDateOverrideReason).toBeNull();
  });

  it('(h) endDate = startDate sin periodo vigente → 201 sin motivo (periodo a medida)', async () => {
    const tenant = await createGymTenant('period-h');
    const { member, plan } = await setupFixture(tenant);

    // No previous period: a one-day period is legitimate, there are no days
    // to lose → free.
    const res = await tenant.owner.client.post<CreatedSub>('/api/subscriptions', {
      memberId: member.id,
      planId: plan.id,
      startDate: localDay(3, TZ),
      endDate: localDay(3, TZ),
      payment: payment(),
    });
    expect(res.status, res.text).toBe(201);
    expect(toLocalDayString(TZ, new Date(res.body.endDate))).toBe(localDay(3, TZ));
    expect(res.body.endDateOverrideReason).toBeNull();
  });

  it('(i) endDate = startDate con periodo vigente → 422 sin motivo', async () => {
    const tenant = await createGymTenant('period-i');
    const { member, plan } = await setupFixture(tenant);

    const first = await tenant.owner.client.post<CreatedSub>('/api/subscriptions', {
      memberId: member.id,
      planId: plan.id,
      payment: payment(),
    });
    expect(first.status, first.text).toBe(201);

    // The same day (today) is far earlier than the end in force → it shortens the
    // period in force and requires a reason.
    const res = await tenant.owner.client.post('/api/subscriptions', {
      memberId: member.id,
      planId: plan.id,
      startDate: localDay(0, TZ),
      endDate: localDay(0, TZ),
      payment: payment(),
    });
    expect(res.status, res.text).toBe(422);
    expect(res.body).toMatchObject({ code: 'END_DATE_OVERRIDE_REASON_REQUIRED' });
  });
});
