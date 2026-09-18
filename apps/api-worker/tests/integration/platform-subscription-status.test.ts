/**
 * Platform subscription status (unificación del modelo de estados de pago).
 *
 * Cubre el contrato SaaS de status computado (no guardado):
 * a. Paridad SQL ↔ helper `computePlatformSubscriptionStatus` en toda la
 *    matriz (trial vigente, validado/processing/voided vigente, gracia 3/7/8/
 *    14/15).
 * b. Un pago `voided` se IGNORA: no revoca servicio ni mueve el periodo.
 * c. `processing` sin pago calificado con periodo vigente → `past_due`.
 * d. Gracia escalonada 3/10/20.
 * e. Anular un pago no mueve `currentPeriodEnd` ni reinicia la gracia.
 * f. Punto 7: un alta `processing` NO front-loadea el periodo; validar
 *    extiende UNA sola vez (duración del snapshot) y re-PATCH no re-extiende.
 * g. Punto 5: sin pago calificado con periodo por delante se puede renovar;
 *    con pago calificado vigente sigue bloqueado.
 * h. `hasPendingPayment`: un `voided` no bloquea un nuevo pago; `processing` sí.
 *
 * Patrón estándar: HTTP real + Neon branch (`TEST_DATABASE_URL`), skip
 * elegante sin la variable, `truncateAll` por archivo. Los hechos crudos
 * (`current_period_end`, `is_trial`, `cancelled_at`, EXISTS de pago calificado)
 * se leen por SQL para alimentar el helper con la misma verdad que el SQL.
 */
import { beforeAll, describe, expect, it } from 'vitest';
import { assertSchemaReady, skipReason, testQuery, truncateAll } from '../helpers/db';
import {
  createGymTenant,
  registerPlatformUser,
  uid,
  isoDate,
  type AuthedUser,
} from '../helpers/auth';
import {
  computePlatformSubscriptionStatus,
  PLATFORM_SUBSCRIPTION_STATUSES,
  type PlatformSubscriptionStatus,
} from '@workspace/shared';

const STATUS = PLATFORM_SUBSCRIPTION_STATUSES;

describe.skipIf(skipReason !== null)('Platform subscription status (SaaS)', () => {
  let admin: AuthedUser;
  let plan: { id: number };

  beforeAll(async () => {
    await assertSchemaReady();
    await truncateAll();

    admin = await registerPlatformUser('admin');
    plan = await createPlatformPlan();
  });

  async function createPlatformPlan(): Promise<{ id: number }> {
    const res = await admin.client.post('/api/platform/plans', {
      name: `SaaS Plan ${uid()}`,
      price: 5000,
      currency: 'USD',
      durationValue: 1,
      durationUnit: 'month',
      isActive: true,
      trialDays: 14,
      features: {
        panel: { enabled: true },
        members_portal: { enabled: true, limits: { member_seats: 5 } },
        ai_chat: { enabled: true, limits: { ai_credits_monthly: 1500 } },
      },
    });
    if (res.status !== 201) throw new Error(`create platform plan failed (${res.status}): ${res.text}`);
    return res.body;
  }

  /** Alta de suscripción SaaS con status de pago explícito (Fase B aún no aplica el default nuevo). */
  async function createSub(
    organizationId: string,
    opts: { paymentStatus?: string; isTrial?: boolean; startDate?: string } = {},
  ): Promise<{ subId: number; paymentId: number }> {
    const paymentStatus = opts.paymentStatus ?? 'validated';
    const startDate = opts.startDate ?? isoDate(0);
    const res = await admin.client.post('/api/platform/subscriptions', {
      organizationId,
      planId: plan.id,
      startDate,
      isTrial: opts.isTrial ?? false,
      payment: {
        amountPaidCents: 5000,
        currencyPaid: 'USD',
        baseAmountCents: 5000,
        paymentMethod: 'zelle',
        paymentMethodDetails: [],
        status: paymentStatus,
        paymentDate: startDate,
      },
    });
    if (res.status !== 201) throw new Error(`create platform sub failed (${res.status}): ${res.text}`);

    const rows = await testQuery<{ id: number }>(
      `SELECT id FROM platform_subscription_payment WHERE subscription_id = $1 ORDER BY id DESC LIMIT 1`,
      [res.body.id],
    );
    return { subId: Number(res.body.id), paymentId: Number(rows[0]!.id) };
  }

  /** Mueve `current_period_end` relativo a NOW() de la DB (negativo = vencida). */
  async function setPeriodEndDays(subId: number, days: number): Promise<void> {
    await testQuery(
      `UPDATE platform_subscription SET current_period_end = NOW() + ($1 || ' days')::interval WHERE id = $2`,
      [String(days), subId],
    );
  }

  async function readPeriodEnd(subId: number): Promise<number> {
    const rows = await testQuery<{ current_period_end: string }>(
      `SELECT current_period_end FROM platform_subscription WHERE id = $1`,
      [subId],
    );
    return new Date(rows[0]!.current_period_end).getTime();
  }

  async function getStatus(subId: number): Promise<PlatformSubscriptionStatus> {
    const res = await admin.client.get(`/api/platform/subscriptions/${subId}`);
    expect(res.status, res.text).toBe(200);
    return res.body.status as PlatformSubscriptionStatus;
  }

  /**
   * Paridad SQL↔helper: lee los hechos crudos de la fila (los mismos que ve el
   * CASE SQL) y compara el status expuesto por el detalle con el helper puro.
   */
  async function assertParity(subId: number): Promise<PlatformSubscriptionStatus> {
    const [row] = await testQuery<{
      current_period_end: string;
      is_trial: boolean;
      cancelled_at: string | null;
      has_validated_payment: boolean;
    }>(
      `SELECT s.current_period_end, s.is_trial, s.cancelled_at,
              EXISTS (
                SELECT 1 FROM platform_subscription_payment p
                WHERE p.subscription_id = s.id
                  AND p.status IN ('validated', 'refunded')
              ) AS has_validated_payment
       FROM platform_subscription s WHERE s.id = $1`,
      [subId],
    );

    const apiStatus = await getStatus(subId);
    const helperStatus = computePlatformSubscriptionStatus({
      currentPeriodEnd: new Date(row!.current_period_end),
      isTrial: row!.is_trial,
      cancelledAt: row!.cancelled_at ? new Date(row!.cancelled_at) : null,
      hasValidatedPayment: row!.has_validated_payment,
      now: new Date(),
    });

    expect(apiStatus, `paridad SQL↔helper para sub ${subId}`).toBe(helperStatus);
    return apiStatus;
  }

  it('a+b. paridad SQL↔helper en la matriz completa de estados', async () => {
    const { organization } = await createGymTenant('status-matrix');

    const cases: Array<{
      name: string;
      expected: PlatformSubscriptionStatus;
      paymentStatus?: string;
      isTrial?: boolean;
      days: number;
    }> = [
      { name: 'trial vigente', expected: STATUS.TRIAL, isTrial: true, paymentStatus: 'validated', days: 10 },
      { name: 'validado + periodo futuro', expected: STATUS.ACTIVE, paymentStatus: 'validated', days: 10 },
      { name: 'processing + periodo futuro', expected: STATUS.PAST_DUE, paymentStatus: 'processing', days: 10 },
      { name: 'voided + periodo futuro', expected: STATUS.PAST_DUE, paymentStatus: 'voided', days: 10 },
      // Offsets a medio día para evitar el borde exacto (reloj Node vs
      // Postgres): la paridad de fronteras exactas se cubre en el unit test
      // determinista de `computePlatformSubscriptionStatus`.
      { name: 'vencida 3 días', expected: STATUS.PAST_DUE, paymentStatus: 'validated', days: -3 },
      { name: 'vencida 7.5 días', expected: STATUS.PAST_DUE, paymentStatus: 'validated', days: -7.5 },
      { name: 'vencida 8.5 días', expected: STATUS.READ_ONLY, paymentStatus: 'validated', days: -8.5 },
      { name: 'vencida 14.5 días', expected: STATUS.READ_ONLY, paymentStatus: 'validated', days: -14.5 },
      { name: 'vencida 15.5 días', expected: STATUS.SUSPENDED, paymentStatus: 'validated', days: -15.5 },
    ];

    for (const c of cases) {
      const { subId } = await createSub(organization.id, {
        paymentStatus: c.paymentStatus,
        isTrial: c.isTrial,
      });
      await setPeriodEndDays(subId, c.days);
      // Un `voided` realista trae auditoría (el status no depende de ella).
      if (c.paymentStatus === 'voided') {
        await testQuery(
          `UPDATE platform_subscription_payment
             SET voided_at = NOW(), voided_by = 'test', void_reason = 'matriz'
           WHERE subscription_id = $1`,
          [subId],
        );
      }

      const status = await assertParity(subId);
      expect(status, c.name).toBe(c.expected);
    }
  });

  it('b. un pago de renovación `voided` se ignora: sigue `active` hasta currentPeriodEnd', async () => {
    const { organization } = await createGymTenant('void-ignored');
    const { subId } = await createSub(organization.id, { paymentStatus: 'validated' });
    await setPeriodEndDays(subId, 10);
    expect(await getStatus(subId)).toBe(STATUS.ACTIVE);

    const before = await readPeriodEnd(subId);

    const extra = await admin.client.post(`/api/platform/subscriptions/${subId}/payments`, {
      amountPaidCents: 5000,
      currencyPaid: 'USD',
      baseAmountCents: 5000,
      paymentMethod: 'zelle',
      paymentMethodDetails: [],
      status: 'voided',
      paymentDate: isoDate(0),
    });
    expect(extra.status, extra.text).toBe(201);

    // El pago nuevo no califica y el validado anterior mantiene el periodo.
    expect(await getStatus(subId)).toBe(STATUS.ACTIVE);
    expect(await readPeriodEnd(subId)).toBe(before);
  });

  it('c. `processing` sin pago calificado con periodo vigente → past_due', async () => {
    const { organization } = await createGymTenant('processing-only');
    const { subId } = await createSub(organization.id, { paymentStatus: 'processing' });
    await setPeriodEndDays(subId, 10);

    expect(await getStatus(subId)).toBe(STATUS.PAST_DUE);
  });

  it('d. gracia escalonada: 3 → past_due, 10 → read_only, 20 → suspended', async () => {
    const { organization } = await createGymTenant('grace');
    const ladder: Array<[number, PlatformSubscriptionStatus]> = [
      [3, STATUS.PAST_DUE],
      [10, STATUS.READ_ONLY],
      [20, STATUS.SUSPENDED],
    ];

    for (const [days, expected] of ladder) {
      const { subId } = await createSub(organization.id, { paymentStatus: 'validated' });
      await setPeriodEndDays(subId, -days);
      expect(await getStatus(subId), `${days} días vencida`).toBe(expected);
    }
  });

  it('e. anular un pago no mueve currentPeriodEnd ni reinicia la gracia', async () => {
    const { organization } = await createGymTenant('grace-void');
    const { subId, paymentId } = await createSub(organization.id, { paymentStatus: 'validated' });
    await setPeriodEndDays(subId, -10);
    const before = await readPeriodEnd(subId);
    expect(await getStatus(subId)).toBe(STATUS.READ_ONLY);

    const voided = await admin.client.patch(
      `/api/platform/subscriptions/payments/${paymentId}/status`,
      { status: 'voided', voidReason: 'Cobro anulado' },
    );
    expect(voided.status, voided.text).toBe(200);

    // El void SaaS no cancela la sub ni reancla el periodo: la gracia sigue
    // corriendo desde el MISMO currentPeriodEnd (no se resetea a ~0 días).
    expect(await readPeriodEnd(subId)).toBe(before);
    expect(await getStatus(subId)).toBe(STATUS.READ_ONLY);
  });

  it('f. Punto 7: alta `processing` no front-loadea; validar extiende una sola vez', async () => {
    const { organization } = await createGymTenant('punto-7');
    const startDate = isoDate(0);
    const { subId, paymentId } = await createSub(organization.id, {
      paymentStatus: 'processing',
      startDate,
    });

    // `currentPeriodEnd === startDate` (UTC midnight), sin regalar tiempo.
    const startUtc = new Date(`${startDate}T00:00:00.000Z`).getTime();
    expect(await readPeriodEnd(subId)).toBe(startUtc);

    const first = await admin.client.patch(
      `/api/platform/subscriptions/payments/${paymentId}/status`,
      { status: 'validated' },
    );
    expect(first.status, first.text).toBe(200);

    const afterFirst = await readPeriodEnd(subId);
    expect(afterFirst).toBeGreaterThan(Date.now());
    // Exactamente una duración de plan (~1 mes), no dos.
    const delta = afterFirst - Date.now();
    expect(delta).toBeGreaterThan(27 * 24 * 60 * 60 * 1000);
    expect(delta).toBeLessThan(32 * 24 * 60 * 60 * 1000);

    // Re-PATCH a validated es idempotente: no vuelve a extender.
    const second = await admin.client.patch(
      `/api/platform/subscriptions/payments/${paymentId}/status`,
      { status: 'validated' },
    );
    expect(second.status, second.text).toBe(200);
    expect(await readPeriodEnd(subId)).toBe(afterFirst);
  });

  it('g. Punto 5: sin pago calificado y periodo por delante permite renovar (201)', async () => {
    const { owner, organization } = await createGymTenant('renew-unpaid');
    const { subId, paymentId } = await createSub(organization.id, { paymentStatus: 'validated' });
    await setPeriodEndDays(subId, 10);

    // Anular el único cobro validado: el periodo sigue (void no lo mueve),
    // pero ya no hay pago calificado que lo sostenga.
    const voided = await admin.client.patch(
      `/api/platform/subscriptions/payments/${paymentId}/status`,
      { status: 'voided', voidReason: 'Cobro anulado' },
    );
    expect(voided.status, voided.text).toBe(200);

    // El status computado (SQL) es `past_due`: hay periodo por delante pero
    // NO hay `EXISTS(validated|refunded)`.
    const statusBefore = await assertParity(subId);
    expect(statusBefore, 'voided-only con periodo futuro debe ser past_due').toBe(STATUS.PAST_DUE);

    const res = await owner.client.post('/api/organizations/subscription/renew', {
      paymentMethod: 'zelle',
      currencyPaid: 'USD',
    });
    expect(res.status, res.text).toBe(201);
    expect(res.body.paymentId).toBeDefined();
  });

  it('g. Punto 5: con pago calificado y periodo vigente sigue bloqueado (409)', async () => {
    const { owner, organization } = await createGymTenant('renew-paid');
    const { subId } = await createSub(organization.id, { paymentStatus: 'validated' });
    await setPeriodEndDays(subId, 10);

    const res = await owner.client.post('/api/organizations/subscription/renew', {
      paymentMethod: 'zelle',
      currencyPaid: 'USD',
    });
    expect(res.status, res.text).toBe(409);
    expect(res.body.error).toContain('vigente');
  });

  it('h. `hasPendingPayment`: un `voided` no bloquea; un `processing` sí', async () => {
    // processing → bloquea la renovación.
    const blocked = await createGymTenant('pending-block');
    const { subId: blockedSub } = await createSub(blocked.organization.id, {
      paymentStatus: 'processing',
    });
    await setPeriodEndDays(blockedSub, -3);
    const blockedRes = await blocked.owner.client.post('/api/organizations/subscription/renew', {
      paymentMethod: 'zelle',
      currencyPaid: 'USD',
    });
    expect(blockedRes.status, blockedRes.text).toBe(409);
    expect(blockedRes.body.error).toContain('pendiente');

    // voided → no bloquea.
    const free = await createGymTenant('pending-free');
    const { subId: freeSub } = await createSub(free.organization.id, { paymentStatus: 'voided' });
    await setPeriodEndDays(freeSub, -3);
    const freeRes = await free.owner.client.post('/api/organizations/subscription/renew', {
      paymentMethod: 'zelle',
      currencyPaid: 'USD',
    });
    expect(freeRes.status, freeRes.text).toBe(201);
  });
});
