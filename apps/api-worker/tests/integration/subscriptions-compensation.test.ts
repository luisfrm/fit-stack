/**
 * Compensación del alta del panel cuando falla la emisión (FS-0002, fase 2).
 *
 * El alta commitea en 3 pasos sin red (`subsRepo.create` →
 * `paymentsRepo.create` → paso 1). Sin transacciones interactivas (driver
 * HTTP de Neon) el `catch` compensa por relectura: pago sin número → `voided`
 * con motivo fijo (reintentable: el guard solo frena `processing`); fallo en
 * el insert del pago → huérfana cancelada, nunca borrada (regla 6).
 *
 * Todo dinero en centavos enteros; la tz la inyecta `requireOrgTimezone()`.
 */
import { beforeAll, describe, expect, it } from 'vitest';
import { assertSchemaReady, skipReason, testQuery, truncateAll } from '../helpers/db';
import {
  createGymTenant,
  createGymMember,
  createPlan,
  isoDate,
  type GymTenant,
} from '../helpers/auth';
import { COMPENSATION_VOID_REASON } from '../../src/lib/subscription-compensation';

const AMOUNT_CENTS = 10000;

describe.skipIf(skipReason !== null)('Subscriptions compensation (fase 2)', () => {
  beforeAll(async () => {
    await assertSchemaReady();
    await truncateAll();
  });

  /** Miembro + plan listos para el alta (precio del plan en centavos). */
  async function setupFixture(tenant: GymTenant) {
    const member = await createGymMember(tenant.owner.client);
    const plan = await createPlan(tenant.owner.client, {
      price: AMOUNT_CENTS,
      currency: 'USD',
      durationValue: 1,
      durationUnit: 'month',
    });
    return { member, plan };
  }

  function subscriptionPayload(memberId: number, planId: number, extraPayment = {}) {
    return {
      memberId,
      planId,
      startDate: isoDate(0),
      endDate: isoDate(30),
      payment: {
        amountPaid: AMOUNT_CENTS,
        currencyPaid: 'USD',
        paymentMethod: 'cash',
        paymentMethodDetails: [],
        status: 'validated',
        paymentDate: isoDate(0),
        ...extraPayment,
      },
    };
  }

  /** Rompe el perfil fiscal: `resolveFiscalProfile` lanza sin fallback. */
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

  it('(a) fallo de emisión → error sin 201, pago voided con motivo, sin número ni hueco ni filas en el reporte', async () => {
    const { owner, organization } = await createGymTenant('comp-a');
    const { member, plan } = await setupFixture({ owner, organization });
    await breakFiscalCountry(organization.id);

    const res = await owner.client.post(
      '/api/subscriptions',
      subscriptionPayload(member.id, plan.id),
    );
    // El error original se re-lanza tras compensar: `onError` lo traduce.
    expect(res.status, res.text).not.toBe(201);

    const payments = await testQuery<{
      id: number;
      status: string;
      void_reason: string | null;
      voided_at: string | null;
      voided_by: string | null;
      receipt_number: string | null;
    }>(
      `SELECT id, status, void_reason, voided_at, voided_by, receipt_number
         FROM payment WHERE member_id = $1`,
      [member.id],
    );
    expect(payments).toHaveLength(1);
    expect(payments[0]!.status).toBe('voided');
    expect(payments[0]!.void_reason).toBe(COMPENSATION_VOID_REASON);
    expect(payments[0]!.voided_at).not.toBeNull();
    expect(payments[0]!.voided_by).toBeTruthy();
    expect(payments[0]!.receipt_number).toBeNull();

    // El perfil fiscal se resuelve ANTES de consumir la secuencia: ningún
    // correlativo quemado → sin hueco en la secuencia anual.
    const seq = await testQuery<{ last_number: number }>(
      `SELECT last_number FROM organization_document_sequence WHERE organization_id = $1`,
      [organization.id],
    );
    expect(seq).toHaveLength(0);

    // El pago `voided` sin número no es comprobante: fuera del reporte.
    const report = await owner.client.get('/api/reports/receipts');
    expect(report.status, report.text).toBe(200);
    expect(report.body.rows).toEqual([]);
    expect(report.body.total).toBe(0);
    expect(report.body.gaps).toEqual([]);

    // La suscripción sigue existiendo como ANULADA: nada se borra (regla 6).
    const list = await owner.client.get<{ data: Array<{ id: number; status: string }> }>(
      '/api/subscriptions',
      { query: { limit: '10' } },
    );
    expect(list.body.data.map((r) => r.status)).toContain('voided');
  });

  it('(b) reintento con fiscal corregido → exactamente 1 suscripción válida y 1 cobro', async () => {
    const { owner, organization } = await createGymTenant('comp-b');
    const { member, plan } = await setupFixture({ owner, organization });
    await breakFiscalCountry(organization.id);

    const failed = await owner.client.post(
      '/api/subscriptions',
      subscriptionPayload(member.id, plan.id),
    );
    expect(failed.status, failed.text).not.toBe(201);

    await fixFiscalCountry(organization.id);
    const retry = await owner.client.post(
      '/api/subscriptions',
      subscriptionPayload(member.id, plan.id),
    );
    // El `voided` no bloquea el reintento (el guard solo frena `processing`).
    expect(retry.status, retry.text).toBe(201);

    // Conteo por memberId: 2 filas de suscripción (la compensada se conserva
    // como auditoría ANULADA) pero exactamente 1 válida y 1 cobro.
    const subs = await testQuery<{ id: number }>(
      `SELECT id FROM subscription WHERE member_id = $1 AND organization_id = $2`,
      [member.id, organization.id],
    );
    expect(subs).toHaveLength(2);

    const valid = await testQuery<{ id: number }>(
      `SELECT s.id FROM subscription s
         JOIN payment p ON p.subscription_id = s.id
        WHERE s.member_id = $1 AND s.organization_id = $2 AND p.status <> 'voided'`,
      [member.id, organization.id],
    );
    expect(valid).toHaveLength(1);

    const charges = await testQuery<{
      id: number;
      status: string;
      receipt_number: string | null;
    }>(
      `SELECT id, status, receipt_number FROM payment
        WHERE member_id = $1 AND organization_id = $2 AND status <> 'voided'`,
      [member.id, organization.id],
    );
    expect(charges).toHaveLength(1);
    expect(charges[0]!.status).toBe('validated');
    expect(charges[0]!.receipt_number).toBeTruthy();
  });

  it('(c) fallo en payment.insert → huérfana cancelada, ningún pago huérfano', async () => {
    const { owner, organization } = await createGymTenant('comp-c');
    const { member, plan } = await setupFixture({ owner, organization });

    // Tasa no numérica: pasa el schema (string) pero la columna
    // `exchange_rate_applied` es numeric(10,4) → el insert falla en DB.
    const res = await owner.client.post(
      '/api/subscriptions',
      subscriptionPayload(member.id, plan.id, { exchangeRateApplied: 'XX-NOT-A-RATE' }),
    );
    expect(res.status, res.text).not.toBe(201);

    const subs = await testQuery<{ id: number; cancelled_at: string | null }>(
      `SELECT id, cancelled_at FROM subscription
        WHERE member_id = $1 AND organization_id = $2`,
      [member.id, organization.id],
    );
    expect(subs).toHaveLength(1);
    // Huérfana cancelada, nunca borrada (regla 6).
    expect(subs[0]!.cancelled_at).not.toBeNull();

    // Ningún pago huérfano: el LEFT JOIN no empareja nada para la suscripción.
    const orphans = await testQuery<{ id: number }>(
      `SELECT s.id FROM subscription s
         LEFT JOIN payment p ON p.subscription_id = s.id
        WHERE s.id = $1 AND p.id IS NULL`,
      [subs[0]!.id],
    );
    expect(orphans).toHaveLength(1);

    const payments = await testQuery<{ id: number }>(
      `SELECT id FROM payment WHERE member_id = $1 AND organization_id = $2`,
      [member.id, organization.id],
    );
    expect(payments).toHaveLength(0);
  });

  it('(d) alta exitosa con la invalidación en finally → 201 intacto (sin regresión de C2)', async () => {
    // C2 (FS-0002 #4) envolvió `servicio + invalidación` en try/finally: en el
    // camino feliz el resultado no debe alterarse (la invalidación corre igual,
    // Redis es no-op en tests, pero el 201 y el cuerpo deben ser los de antes).
    const { owner, organization } = await createGymTenant('comp-d');
    const { member, plan } = await setupFixture({ owner, organization });

    const res = await owner.client.post<{ id: number; endDate: string }>(
      '/api/subscriptions',
      subscriptionPayload(member.id, plan.id),
    );
    expect(res.status, res.text).toBe(201);
    expect(res.body.id).toBeDefined();
    expect(res.body.endDate).toBeTruthy();

    // El pago quedó validado y numerado (emisión exitosa).
    const charges = await testQuery<{ status: string; receipt_number: string | null }>(
      `SELECT status, receipt_number FROM payment
        WHERE member_id = $1 AND organization_id = $2`,
      [member.id, organization.id],
    );
    expect(charges).toHaveLength(1);
    expect(charges[0]!.status).toBe('validated');
    expect(charges[0]!.receipt_number).toBeTruthy();
  });
});
