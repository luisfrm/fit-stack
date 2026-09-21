/**
 * Compensación SaaS cuando falla la emisión (FS-0002, fase 3 — B3.2).
 *
 * Los 4 flujos SaaS commitean sin red (Neon HTTP no tiene `db.transaction()`):
 * el `catch` compensa por relectura con el helper de fase-2. Semántica SaaS:
 * el alta que queda sin pago válido también se anula con `cancel()` — nunca
 * `delete()` (un `voided` se ignora en el cómputo SaaS y dejaría un periodo
 * front-loadeado sin cobro que lo sostenga); renovación/registro/transición
 * anulan el pago y REVIERTEN el periodo movido al valor leído antes de
 * extender. Un pago compensado (`voided`) no puede re-validarse para volver a
 * extender (guard anti doble-extensión).
 *
 * El fallo se induce rompiendo el país fiscal (`XX`): `resolveFiscalProfile`
 * lanza `FISCAL_PROFILE_UNKNOWN` ANTES de consumir la secuencia `FS-N`.
 * Todo dinero en centavos enteros.
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
import { addDuration } from '../../src/lib/billing-utils';
import { COMPENSATION_VOID_REASON } from '../../src/lib/subscription-compensation';

const PRICE_CENTS = 5000;

describe.skipIf(skipReason !== null)('Platform subscriptions compensation (fase 3)', () => {
  let admin: AuthedUser;

  beforeAll(async () => {
    await assertSchemaReady();
    await truncateAll();
    admin = await registerPlatformUser('admin');
  });

  async function createPlatformPlan(): Promise<{ id: number }> {
    const res = await admin.client.post('/api/platform/plans', {
      name: `SaaS Plan ${uid()}`,
      price: PRICE_CENTS,
      currency: 'USD',
      durationValue: 1,
      durationUnit: 'month',
      isActive: true,
      trialDays: 0,
      features: {
        panel: { enabled: true },
        members_portal: { enabled: true, limits: { member_seats: 5 } },
        ai_chat: { enabled: true, limits: { ai_credits_monthly: 1500 } },
      },
    });
    expect(res.status, res.text).toBe(201);
    return res.body;
  }

  function validatedPayment() {
    return {
      amountPaidCents: PRICE_CENTS,
      currencyPaid: 'USD',
      baseAmountCents: PRICE_CENTS,
      paymentMethod: 'zelle',
      paymentMethodDetails: [],
      status: 'validated',
      paymentDate: isoDate(0),
    };
  }

  function altaPayload(organizationId: string, planId: number, startDate = isoDate(0)) {
    return {
      organizationId,
      planId,
      startDate,
      isTrial: false,
      payment: validatedPayment(),
    };
  }

  /** Rompe el perfil fiscal: la emisión lanza sin consumir la serie `FS-N`. */
  async function breakFiscalCountry(organizationId: string) {
    await testQuery(`UPDATE organization SET country_code = 'XX' WHERE id = $1`, [
      organizationId,
    ]);
  }

  async function fixFiscalCountry(organizationId: string) {
    await testQuery(`UPDATE organization SET country_code = 'VE' WHERE id = $1`, [
      organizationId,
    ]);
  }

  async function readPayments(organizationId: string) {
    return testQuery<{
      id: number;
      subscription_id: number;
      status: string;
      amount_paid: number;
      void_reason: string | null;
      voided_at: string | null;
      voided_by: string | null;
      receipt_number: string | null;
    }>(
      `SELECT id, subscription_id, status, amount_paid, void_reason, voided_at,
              voided_by, receipt_number
         FROM platform_subscription_payment WHERE organization_id = $1 ORDER BY id`,
      [organizationId],
    );
  }

  async function readSubs(organizationId: string) {
    return testQuery<{
      id: number;
      cancelled_at: string | null;
      current_period_end: string;
    }>(
      `SELECT id, cancelled_at, current_period_end
         FROM platform_subscription WHERE organization_id = $1 ORDER BY id`,
      [organizationId],
    );
  }

  async function readSequence(): Promise<number> {
    const rows = await testQuery<{ next_number: number }>(
      `SELECT next_number FROM platform_document_sequence WHERE document_type = 'receipt'`,
    );
    return rows[0]?.next_number ?? 0;
  }

  /** Garantía visible: ningún cobro válido sin comprobante (salvo $0 `pre_system` por diseño). */
  async function expectNoValidChargeWithoutReceipt(organizationId: string) {
    const orphans = await testQuery<{ id: number }>(
      `SELECT id FROM platform_subscription_payment
        WHERE organization_id = $1 AND status IN ('validated', 'refunded')
          AND receipt_number IS NULL AND amount_paid <> 0`,
      [organizationId],
    );
    expect(orphans).toEqual([]);
  }

  it('(a) alta con fallo de emisión → pago voided con motivo + suscripción cancelada, sin FS-N consumido; reintento limpio', async () => {
    const { organization } = await createGymTenant('psca-a');
    const orgId = organization.id;
    const plan = await createPlatformPlan();
    const seqBefore = await readSequence();
    await breakFiscalCountry(orgId);

    const failed = await admin.client.post(
      '/api/platform/subscriptions',
      altaPayload(orgId, plan.id),
    );
    // El error original se re-lanza tras compensar: `onError` lo traduce.
    expect(failed.status, failed.text).not.toBe(201);

    const payments = await readPayments(orgId);
    expect(payments).toHaveLength(1);
    expect(payments[0]!.status).toBe('voided');
    expect(payments[0]!.void_reason).toBe(COMPENSATION_VOID_REASON);
    expect(payments[0]!.voided_at).not.toBeNull();
    expect(payments[0]!.voided_by).toBeTruthy();
    expect(payments[0]!.receipt_number).toBeNull();

    // Alta sin pago válido: cancelada, nunca borrada (regla 6, la serie
    // `FS-N` no se vacía vía `DELETE /api/platform/subscriptions/:id`).
    const subs = await readSubs(orgId);
    expect(subs).toHaveLength(1);
    expect(subs[0]!.cancelled_at).not.toBeNull();

    // El perfil fiscal se resuelve ANTES de consumir la secuencia global.
    expect(await readSequence()).toBe(seqBefore);

    await expectNoValidChargeWithoutReceipt(orgId);

    // Reintento con fiscal corregido: 201, sin duplicar (el `voided` no
    // bloquea: el guard solo frena `processing`).
    await fixFiscalCountry(orgId);
    const retry = await admin.client.post(
      '/api/platform/subscriptions',
      altaPayload(orgId, plan.id),
    );
    expect(retry.status, retry.text).toBe(201);

    const subsAfter = await readSubs(orgId);
    expect(subsAfter).toHaveLength(2);
    expect(subsAfter.filter((s) => s.cancelled_at == null)).toHaveLength(1);

    const charges = await testQuery<{
      id: number;
      status: string;
      receipt_number: string | null;
    }>(
      `SELECT id, status, receipt_number FROM platform_subscription_payment
        WHERE organization_id = $1 AND status IN ('validated', 'refunded')`,
      [orgId],
    );
    expect(charges).toHaveLength(1);
    expect(charges[0]!.receipt_number).toMatch(/^FS-\d{7,}$/);
    await expectNoValidChargeWithoutReceipt(orgId);
  });

  it('(b) renovación con fallo → pago voided y periodo REVERTIDO al valor previo', async () => {
    const { organization } = await createGymTenant('pscb-b');
    const orgId = organization.id;
    const plan = await createPlatformPlan();

    // Alta sana: periodo front-loadeado (inicio + 1 mes del plan).
    const alta = await admin.client.post(
      '/api/platform/subscriptions',
      altaPayload(orgId, plan.id),
    );
    expect(alta.status, alta.text).toBe(201);
    const subId = Number(alta.body.id);
    const periodBefore = new Date((await readSubs(orgId))[0]!.current_period_end);

    await breakFiscalCountry(orgId);
    const failed = await admin.client.post(`/api/platform/subscriptions/${subId}/renew`, {
      payment: validatedPayment(),
    });
    expect(failed.status, failed.text).not.toBe(200);

    const payments = await readPayments(orgId);
    expect(payments).toHaveLength(2);
    const renewal = payments[1]!;
    expect(renewal.status).toBe('voided');
    expect(renewal.void_reason).toBe(COMPENSATION_VOID_REASON);
    expect(renewal.voided_at).not.toBeNull();
    expect(renewal.voided_by).toBeTruthy();
    expect(renewal.receipt_number).toBeNull();

    // El periodo se movió antes del fallo y se REVIERTE al valor previo: sin
    // transacción, el write compensatorio es honesto (`currentPeriodEnd` se
    // leyó antes de extender). Sin `cancelParent`: la suscripción preexiste.
    const subs = await readSubs(orgId);
    expect(subs[0]!.cancelled_at).toBeNull();
    const periodAfter = new Date(subs[0]!.current_period_end);
    expect(periodAfter.getTime()).toBe(periodBefore.getTime());

    await expectNoValidChargeWithoutReceipt(orgId);

    // Reintento con fiscal corregido: 200 con un único cobro nuevo (el
    // `voided` no bloquea el guard); el periodo acumula desde lo revertido
    // (base = periodBefore), no desde un periodo movido dos veces.
    await fixFiscalCountry(orgId);
    const retry = await admin.client.post(`/api/platform/subscriptions/${subId}/renew`, {
      payment: validatedPayment(),
    });
    expect(retry.status, retry.text).toBe(200);

    const after = await readPayments(orgId);
    expect(after).toHaveLength(3);
    expect(after.filter((p) => p.status === 'voided')).toHaveLength(1);
    const valid = after.filter((p) => p.status === 'validated' || p.status === 'refunded');
    expect(valid).toHaveLength(2);
    expect(valid[1]!.receipt_number).toMatch(/^FS-\d{7,}$/);
    await expectNoValidChargeWithoutReceipt(orgId);

    // Un solo periodo extra por un solo pago: el fallido no regala días.
    const periodFinal = new Date((await readSubs(orgId))[0]!.current_period_end);
    expect(periodFinal.getTime()).toBe(addDuration(periodBefore, 1, 'month').getTime());
  });

  it('(c) transición a validado con fallo → pago voided, periodo revertido; re-PATCH no re-extiende', async () => {
    const { organization } = await createGymTenant('pscb-c');
    const orgId = organization.id;
    const plan = await createPlatformPlan();

    // Alta `processing`: sin emisión, periodo = inicio (60 días atrás).
    const alta = await admin.client.post('/api/platform/subscriptions', {
      ...altaPayload(orgId, plan.id, isoDate(-60)),
      payment: { ...validatedPayment(), status: 'processing', paymentDate: isoDate(-60) },
    });
    expect(alta.status, alta.text).toBe(201);
    const subId = Number(alta.body.id);
    const paymentRows = await testQuery<{ id: number }>(
      `SELECT id FROM platform_subscription_payment WHERE subscription_id = $1`,
      [subId],
    );
    const paymentId = Number(paymentRows[0]!.id);
    const periodBefore = new Date((await readSubs(orgId))[0]!.current_period_end);

    await breakFiscalCountry(orgId);
    const failed = await admin.client.patch(
      `/api/platform/subscriptions/payments/${paymentId}/status`,
      { status: 'validated' },
    );
    expect(failed.status, failed.text).not.toBe(200);

    const payments = await readPayments(orgId);
    expect(payments).toHaveLength(1);
    expect(payments[0]!.status).toBe('voided');
    expect(payments[0]!.void_reason).toBe(COMPENSATION_VOID_REASON);
    expect(payments[0]!.voided_at).not.toBeNull();
    expect(payments[0]!.voided_by).toBeTruthy();
    expect(payments[0]!.receipt_number).toBeNull();

    // La transición extendió el periodo antes de fallar y se REVIERTE al
    // valor previo; la suscripción no se cancela (preexiste).
    const subs = await readSubs(orgId);
    expect(subs[0]!.cancelled_at).toBeNull();
    expect(new Date(subs[0]!.current_period_end).getTime()).toBe(periodBefore.getTime());

    await expectNoValidChargeWithoutReceipt(orgId);

    // Guard anti doble-extensión: re-PATCH del pago compensado a `validated`
    // se rechaza por código (un `voided` no puede re-validarse: no hay cobro
    // válido y la invariante validado ⇔ numerado lo prohíbe).
    const rePatch = await admin.client.patch(
      `/api/platform/subscriptions/payments/${paymentId}/status`,
      { status: 'validated' },
    );
    expect(rePatch.status, rePatch.text).toBe(409);
    expect(rePatch.body).toMatchObject({ code: 'PAYMENT_NOT_REVALIDATABLE' });
    const afterRePatch = await readPayments(orgId);
    expect(afterRePatch[0]!.status).toBe('voided');
    expect(new Date((await readSubs(orgId))[0]!.current_period_end).getTime()).toBe(
      periodBefore.getTime(),
    );

    // Reintento limpio: un pago nuevo tras corregir el fiscal (el `voided`
    // no bloquea el guard de pendientes); un solo cobro válido numerado.
    await fixFiscalCountry(orgId);
    const retry = await admin.client.post(
      `/api/platform/subscriptions/${subId}/payments`,
      validatedPayment(),
    );
    expect(retry.status, retry.text).toBe(201);

    const after = await readPayments(orgId);
    expect(after).toHaveLength(2);
    const valid = after.filter((p) => p.status === 'validated' || p.status === 'refunded');
    expect(valid).toHaveLength(1);
    expect(valid[0]!.receipt_number).toMatch(/^FS-\d{7,}$/);
    await expectNoValidChargeWithoutReceipt(orgId);
  });

  it('(d) validar un pago de una suscripción cancelada → 409 con code, sin validated huérfano', async () => {
    const { organization } = await createGymTenant('pscb-d');
    const orgId = organization.id;
    const plan = await createPlatformPlan();

    // Alta `processing` (sin emisión) y luego cancelación de la suscripción.
    const alta = await admin.client.post('/api/platform/subscriptions', {
      ...altaPayload(orgId, plan.id),
      payment: { ...validatedPayment(), status: 'processing' },
    });
    expect(alta.status, alta.text).toBe(201);
    const subId = Number(alta.body.id);
    const paymentRows = await testQuery<{ id: number }>(
      `SELECT id FROM platform_subscription_payment WHERE subscription_id = $1`,
      [subId],
    );
    const paymentId = Number(paymentRows[0]!.id);

    // Cancelación lógica (no `DELETE`, que borra en duro y se lleva el pago
    // por cascada): fija `cancelled_at` y el pago `processing` sobrevive.
    const cancel = await admin.client.post(`/api/platform/subscriptions/${subId}/cancel`, {
      reason: 'Cancelación de prueba (d)',
    });
    expect(cancel.status, cancel.text).toBe(200);

    // El pago `processing` de una suscripción cancelada NO se valida: sin este
    // guard quedaría un `validated` sin número (invariante validado ⇔ numerado).
    const attempt = await admin.client.patch(
      `/api/platform/subscriptions/payments/${paymentId}/status`,
      { status: 'validated' },
    );
    expect(attempt.status, attempt.text).toBe(409);
    expect(attempt.body).toMatchObject({ code: 'SUBSCRIPTION_CANCELLED' });

    const payments = await readPayments(orgId);
    expect(payments[0]!.status).toBe('processing');
    expect(payments[0]!.receipt_number).toBeNull();
    await expectNoValidChargeWithoutReceipt(orgId);
  });
});
