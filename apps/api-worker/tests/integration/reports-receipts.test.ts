/**
 * Reporte de comprobantes (Fase 5): clasificación, gaps, totales por moneda,
 * RBAC y filtros de día local.
 *
 * Patrón estándar: HTTP real + Neon branch (`TEST_DATABASE_URL`), skip
 * elegante sin la variable, `truncateAll` por archivo.
 */
import { beforeAll, describe, expect, it, vi } from 'vitest';

vi.mock('../../../jobs-worker/src/receipt-pdf', () => ({
  renderReceiptPdfBytes: async () => new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31]),
}));

import { createClient } from '../helpers/client';
import {
  assertSchemaReady,
  skipReason,
  testQuery,
  truncateAll,
  TEST_DATABASE_URL,
} from '../helpers/db';
import {
  addUserToOrganization,
  createGymMember,
  createGymTenant,
  createPlan,
  isoDate,
} from '../helpers/auth';
import { ORG_ROLES } from '@workspace/shared';
import {
  handleReceiptRender,
  type ReceiptHandlerEnv,
} from '../../../jobs-worker/src/handlers/receipt.handler';

describe.skipIf(skipReason !== null)('Receipts report (Fase 5)', () => {
  beforeAll(async () => {
    await assertSchemaReady();
    await truncateAll();
  });

  /** Tenant + plan + miembro + pago `validated` (numerado al instante). */
  async function createNumberedPayment(
    client: ReturnType<typeof createClient>,
    overrides: Record<string, unknown> = {},
  ) {
    const member = await createGymMember(client);
    const plan = await createPlan(client, { price: 10000, currency: 'USD' });
    const res = await client.post('/api/subscriptions', {
      memberId: member.id,
      planId: plan.id,
      startDate: isoDate(0),
      endDate: isoDate(30),
      payment: {
        amountPaid: 10000,
        currencyPaid: 'USD',
        paymentMethod: 'cash',
        paymentMethodDetails: [],
        status: 'validated',
        paymentDate: isoDate(0),
        ...overrides,
      },
    });
    expect(res.status, res.text).toBe(201);
    const rows = await testQuery<Record<string, unknown>>(
      `SELECT * FROM payment WHERE subscription_id = $1`,
      [res.body.id],
    );
    return { member, plan, payment: rows[0]! };
  }

  /** Pago `validated` anterior al sistema (sin número): solo vía SQL. */
  async function createLegacyPayment(
    organizationId: string,
    client: ReturnType<typeof createClient>,
  ) {
    const member = await createGymMember(client);
    const rows = await testQuery<Record<string, unknown>>(
      `INSERT INTO payment
         (organization_id, member_id, plan_snapshot_name, plan_snapshot_price,
          plan_snapshot_currency, amount_paid, currency_paid, status,
          payment_method, payment_date)
       VALUES ($1, $2, 'Plan viejo', 5000, 'USD', 5000, 'USD', 'validated',
          'cash', NOW())
       RETURNING *`,
      [organizationId, member.id],
    );
    return rows[0]!;
  }

  it('clasifica issued / pre_system y resume totales por moneda', async () => {
    const { owner, organization } = await createGymTenant('report-basic');
    const { payment } = await createNumberedPayment(owner.client);
    await createLegacyPayment(organization.id, owner.client);

    // Paso 2 real: el numerado queda emitido (no solo pendiente de PDF).
    const env = owner.client.env as Record<string, unknown>;
    const jobsEnv = {
      DATABASE_URL: TEST_DATABASE_URL,
      FILES_BUCKET: env['FILES_BUCKET'],
      TASK_QUEUE: env['TASK_QUEUE'],
    } as ReceiptHandlerEnv;
    const paymentId = Number(payment['id']);
    const receiptNumber = payment['receipt_number'] as string;
    const rendered = await handleReceiptRender(jobsEnv, {
      type: 'receipt.render',
      scope: 'panel',
      paymentId,
      organizationId: organization.id,
      receiptNumber,
    });
    expect(rendered).toBe('completed');

    const res = await owner.client.get('/api/reports/receipts', {
      query: { status: 'all' },
    });
    expect(res.status, res.text).toBe(200);
    const body = res.body as {
      rows: Array<{ state: string; receiptNumber: string | null }>;
      summary: { issued: number; preSystem: number; voided: number; pending: number };
      totals: Array<{ currency: string; amount: number }>;
      gaps: unknown[];
    };
    expect(body.summary.issued).toBe(1);
    expect(body.summary.preSystem).toBe(1);
    expect(body.summary.voided).toBe(0);
    expect(body.rows.map((r) => r.state).sort()).toEqual(['issued', 'pre_system']);
    expect(body.totals).toEqual([
      expect.objectContaining({ currency: 'USD', amount: 10000 }),
    ]);
    // Sin huecos: secuencia 1:1 con lo emitido.
    expect(body.gaps).toEqual([]);
  });

  it('anulado se explica y el salto de secuencia es hueco sospechoso', async () => {
    const { owner, organization } = await createGymTenant('report-gaps');
    const first = await createNumberedPayment(owner.client);
    const second = await createNumberedPayment(owner.client);
    const secondId = Number(second.payment['id']);

    const voided = await owner.client.patch(`/api/payments/${secondId}/status`, {
      status: 'voided',
    });
    expect(voided.status, voided.text).toBe(200);

    // Salto artificial de secuencia (+5): los intermedios son huecos reales.
    const year = new Date(
      new Date().toLocaleString('en-US', { timeZone: 'America/Caracas' }),
    ).getFullYear();
    await testQuery(
      `UPDATE organization_document_sequence
       SET last_number = last_number + 5
       WHERE organization_id = $1 AND document_type = 'receipt' AND year = $2`,
      [organization.id, year],
    );
    const third = await createNumberedPayment(owner.client);
    const thirdNumber = third.payment['receipt_number'] as string;

    const res = await owner.client.get('/api/reports/receipts', {
      query: { status: 'gaps' },
    });
    expect(res.status, res.text).toBe(200);
    const body = res.body as {
      rows: unknown[];
      gaps: Array<{
        kind: string;
        seq: number;
        receiptNumber: string;
        voidReason?: string | null;
      }>;
    };
    expect(body.rows).toEqual([]);

    const anulados = body.gaps.filter((g) => g.kind === 'anulado');
    const huecos = body.gaps.filter((g) => g.kind === 'hueco');
    // Seq 2 anulado con motivo; seqs 3..7 huecos; seq 8 = tercer pago.
    expect(anulados).toHaveLength(1);
    expect(anulados[0]).toMatchObject({
      seq: 2,
      receiptNumber: second.payment['receipt_number'],
      voidReason: 'Pago anulado',
    });
    expect(huecos.map((g) => g.seq)).toEqual([3, 4, 5, 6, 7]);
    expect(thirdNumber).toMatch(new RegExp(`^${organization.slug}-${year}-0*8$`));

    // El filtro voided devuelve solo el anulado; anular no renumera.
    const voidedRes = await owner.client.get('/api/reports/receipts', {
      query: { status: 'voided' },
    });
    expect(voidedRes.status, voidedRes.text).toBe(200);
    const voidedBody = voidedRes.body as { rows: Array<{ receiptNumber: string }> };
    expect(voidedBody.rows.map((r) => r.receiptNumber)).toEqual([
      second.payment['receipt_number'],
    ]);
    expect(first.payment['receipt_number']).toMatch(
      new RegExp(`^${organization.slug}-${year}-0*1$`),
    );
  });

  it('filtros de día local: 01:00 UTC es el día anterior en VE', async () => {
    const { owner, organization } = await createGymTenant('report-tz');
    const { payment } = await createNumberedPayment(owner.client);
    const paymentId = Number(payment['id']);
    // 2026-01-02 01:00 UTC = 2026-01-01 21:00 en Caracas. Se fija por SQL
    // porque la emisión siempre ocurre "ahora" por API.
    await testQuery(`UPDATE payment SET receipt_issued_at = $1 WHERE id = $2`, [
      '2026-01-02T01:00:00.000Z',
      paymentId,
    ]);
    // Paso 2 para que el numerado quede emitido (no pendiente de PDF).
    const env = owner.client.env as Record<string, unknown>;
    const rendered = await handleReceiptRender(
      {
        DATABASE_URL: TEST_DATABASE_URL,
        FILES_BUCKET: env['FILES_BUCKET'],
        TASK_QUEUE: env['TASK_QUEUE'],
      } as ReceiptHandlerEnv,
      {
        type: 'receipt.render',
        scope: 'panel',
        paymentId,
        organizationId: organization.id,
        receiptNumber: payment['receipt_number'] as string,
      },
    );
    expect(rendered).toBe('completed');
    await testQuery(
      `INSERT INTO payment
         (organization_id, member_id, plan_snapshot_name, plan_snapshot_price,
          plan_snapshot_currency, amount_paid, currency_paid, status,
          payment_method, payment_date)
       VALUES ($1, $2, 'Plan viejo', 5000, 'USD', 5000, 'USD', 'validated',
          'cash', '2026-01-02T01:00:00.000Z')`,
      [organization.id, Number((await createGymMember(owner.client)).id)],
    );

    const jan1 = await owner.client.get('/api/reports/receipts', {
      query: { from: '2026-01-01', to: '2026-01-01' },
    });
    expect(jan1.status, jan1.text).toBe(200);
    const jan1Body = jan1.body as { rows: Array<{ state: string }> };
    // Numerado (por receipt_issued_at) + pre_system (por payment_date).
    expect(jan1Body.rows.map((r) => r.state).sort()).toEqual([
      'issued',
      'pre_system',
    ]);

    const jan2 = await owner.client.get('/api/reports/receipts', {
      query: { from: '2026-01-02', to: '2026-01-02' },
    });
    expect(jan2.status, jan2.text).toBe(200);
    expect((jan2.body as { rows: unknown[] }).rows).toEqual([]);
  });

  it('issued excluye pendientes; method y límites se validan', async () => {
    const { owner } = await createGymTenant('report-filters2');
    // Numerado sin paso 2 = pendiente de PDF (subconjunto propio de issued).
    await createNumberedPayment(owner.client);

    const issued = await owner.client.get('/api/reports/receipts', {
      query: { status: 'issued' },
    });
    expect(issued.status, issued.text).toBe(200);
    expect((issued.body as { rows: unknown[] }).rows).toEqual([]);

    const pending = await owner.client.get('/api/reports/receipts', {
      query: { status: 'pending' },
    });
    expect(pending.status, pending.text).toBe(200);
    expect((pending.body as { rows: unknown[] }).rows).toHaveLength(1);

    const byMethod = await owner.client.get('/api/reports/receipts', {
      query: { method: 'cash' },
    });
    expect(byMethod.status, byMethod.text).toBe(200);
    expect((byMethod.body as { rows: unknown[] }).rows).toHaveLength(1);

    const otherMethod = await owner.client.get('/api/reports/receipts', {
      query: { method: 'tarjeta' },
    });
    expect(otherMethod.status, otherMethod.text).toBe(200);
    expect((otherMethod.body as { rows: unknown[] }).rows).toEqual([]);

    const bigLimit = await owner.client.get('/api/reports/receipts', {
      query: { limit: 1001 },
    });
    expect(bigLimit.status, bigLimit.text).toBe(400);

    const badYear = await owner.client.get('/api/reports/receipts', {
      query: { year: 9999 },
    });
    expect(badYear.status, badYear.text).toBe(400);
    expect(badYear.body).toMatchObject({ code: 'INVALID_REPORT_FILTERS' });
  });

  it('filtros inválidos → 400 con código', async () => {
    const { owner } = await createGymTenant('report-filters');
    const badStatus = await owner.client.get('/api/reports/receipts', {
      query: { status: 'bogus' },
    });
    expect(badStatus.status, badStatus.text).toBe(400);
    expect(badStatus.body).toMatchObject({ code: 'INVALID_REPORT_FILTERS' });

    const badPage = await owner.client.get('/api/reports/receipts', {
      query: { page: 0 },
    });
    expect(badPage.status, badPage.text).toBe(400);
  });

  it('RBAC: member/coach 403; cashier/manager/owner 200', async () => {
    const { owner, organization } = await createGymTenant('report-rbac');
    const member = await addUserToOrganization(
      organization.id,
      ORG_ROLES.MEMBER,
      'report-member',
    );
    const coach = await addUserToOrganization(
      organization.id,
      ORG_ROLES.COACH,
      'report-coach',
    );
    const cashier = await addUserToOrganization(
      organization.id,
      ORG_ROLES.CASHIER,
      'report-cashier',
    );
    const manager = await addUserToOrganization(
      organization.id,
      ORG_ROLES.MANAGER,
      'report-manager',
    );

    for (const user of [member, coach]) {
      const res = await user.client.get('/api/reports/receipts');
      expect(res.status, res.text).toBe(403);
    }
    for (const user of [cashier, manager, owner]) {
      const res = await user.client.get('/api/reports/receipts');
      expect(res.status, res.text).toBe(200);
    }
  });
});
