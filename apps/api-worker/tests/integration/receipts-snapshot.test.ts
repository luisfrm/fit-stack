/**
 * Snapshot del emisor (C1) + trazabilidad de emisión (C5).
 *
 * C1: `GET /:id/receipt` debe devolver SIEMPRE lo emitido. El test emite,
 * cambia el perfil del emisor (nombre legal, RIF, dirección, país y
 * `fiscalConfig`) y vuelve a pedir el comprobante: tiene que ser idéntico.
 * C5: `issued_by` es el actor de sesión que numeró; el paso 2 (consumer, sin
 * sesión) nunca lo pisa ni inventa uno.
 *
 * Patrón estándar: HTTP real + Neon branch (`TEST_DATABASE_URL`), skip
 * elegante sin la variable, `truncateAll` por archivo.
 */
import { beforeAll, describe, expect, it, vi } from 'vitest';

vi.mock('../../../jobs-worker/src/receipt-pdf', () => ({
  renderReceiptPdfBytes: async () => new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31]),
}));

import {
  assertSchemaReady,
  skipReason,
  testQuery,
  truncateAll,
  TEST_DATABASE_URL,
} from '../helpers/db';
import {
  createGymMember,
  createGymTenant,
  createPlan,
  isoDate,
  type AuthedUser,
  type GymTenant,
} from '../helpers/auth';
import {
  handleReceiptRender,
  type ReceiptHandlerEnv,
} from '../../../jobs-worker/src/handlers/receipt.handler';

describe.skipIf(skipReason !== null)('Receipt snapshot + issued_by (C1/C5)', () => {
  let tenant: GymTenant;

  beforeAll(async () => {
    await assertSchemaReady();
    await truncateAll();
    tenant = await createGymTenant('c1');
  });

  function jobsEnv(owner: AuthedUser): ReceiptHandlerEnv {
    const env = owner.client.env as Record<string, unknown>;
    return {
      DATABASE_URL: TEST_DATABASE_URL,
      FILES_BUCKET: env['FILES_BUCKET'] as R2Bucket,
      TASK_QUEUE: env['TASK_QUEUE'] as Queue,
    };
  }

  /** Pago `validated` por API (numera en la misma request) + paso 2 real. */
  async function emitReceipt(): Promise<{ paymentId: number; receiptNumber: string }> {
    const member = await createGymMember(tenant.owner.client);
    const plan = await createPlan(tenant.owner.client, { price: 10000, currency: 'USD' });
    const res = await tenant.owner.client.post('/api/subscriptions', {
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
      },
    });
    expect(res.status, res.text).toBe(201);
    const [row] = await testQuery<{ id: number; receipt_number: string }>(
      `SELECT id, receipt_number FROM payment WHERE subscription_id = $1`,
      [res.body.id],
    );
    const paymentId = Number(row!.id);
    const rendered = await handleReceiptRender(jobsEnv(tenant.owner), {
      type: 'receipt.render',
      scope: 'panel',
      paymentId,
      organizationId: tenant.organization.id,
      receiptNumber: row!.receipt_number,
    });
    expect(rendered).toBe('completed');
    return { paymentId, receiptNumber: row!.receipt_number };
  }

  async function getReceipt(paymentId: number) {
    const res = await tenant.owner.client.get(`/api/payments/${paymentId}/receipt`);
    expect(res.status, res.text).toBe(200);
    return res.body as {
      receiptNumber: string;
      receipt: {
        emitter: { name: string; legalName: string | null; taxId: string | null; countryCode: string };
        recipient: { docLabel?: string | null };
        document: { label: string };
        footer: { disclaimer: string[] };
      };
    };
  }

  it('C1: editar el perfil del emisor no cambia el comprobante ya emitido', async () => {
    const { paymentId } = await emitReceipt();
    const asIssued = await getReceipt(paymentId);

    // El gym cambia TODO lo que antes se leía en vivo: nombre legal, RIF,
    // dirección, país y declaración fiscal (con desglose activado).
    await testQuery(
      `UPDATE organization
       SET legal_name = 'Otro Nombre C.A.',
           tax_id = 'J-99999999-9',
           address = 'Otra dirección',
           country_code = 'CO',
           fiscal_config = '{"isFormalTaxpayer": true}'::jsonb
       WHERE id = $1`,
      [tenant.organization.id],
    );

    const after = await getReceipt(paymentId);
    expect(after.receipt.emitter).toEqual(asIssued.receipt.emitter);
    expect(after.receipt.footer.disclaimer).toEqual(asIssued.receipt.footer.disclaimer);
    expect(after.receipt.document.label).toBe(asIssued.receipt.document.label);
    expect(after.receipt.recipient.docLabel).toBe(asIssued.receipt.recipient.docLabel);
    // Sanity: la fila viva SÍ cambió (el snapshot es lo que congela el JSON).
    const [org] = await testQuery<{ legal_name: string }>(
      `SELECT legal_name FROM organization WHERE id = $1`,
      [tenant.organization.id],
    );
    expect(org!.legal_name).toBe('Otro Nombre C.A.');

    const [row] = await testQuery<{ emitter_snapshot: unknown; issued_by: string | null }>(
      `SELECT emitter_snapshot, issued_by FROM payment WHERE id = $1`,
      [paymentId],
    );
    expect(row!.emitter_snapshot).not.toBeNull();
    // C5: el actor de sesión que emitió.
    expect(row!.issued_by).toBe(tenant.owner.userId);
  });

  it('C5: la emisión manual también deja actor', async () => {
    // Pago validado SIN número (legacy): `POST /:id/issue` numera y deja actor.
    const member = await createGymMember(tenant.owner.client);
    const rows = await testQuery<{ id: number }>(
      `INSERT INTO payment
         (organization_id, member_id, plan_snapshot_name, plan_snapshot_price,
          plan_snapshot_currency, amount_paid, currency_paid, status,
          payment_method, payment_date)
       VALUES ($1, $2, 'Plan viejo', 5000, 'USD', 5000, 'USD', 'validated', 'cash', NOW())
       RETURNING id`,
      [tenant.organization.id, Number(member.id)],
    );
    const paymentId = Number(rows[0]!.id);

    const res = await tenant.owner.client.post(`/api/payments/${paymentId}/issue`);
    expect(res.status, res.text).toBe(200);

    const [row] = await testQuery<{ issued_by: string | null; emitter_snapshot: unknown }>(
      `SELECT issued_by, emitter_snapshot FROM payment WHERE id = $1`,
      [paymentId],
    );
    expect(row!.issued_by).toBe(tenant.owner.userId);
    expect(row!.emitter_snapshot).not.toBeNull();
  });

  it('C1/C5: paso 2 (sin sesión) no pisa la auditoría de la emisión', async () => {
    const { paymentId } = await emitReceipt();
    const before = await testQuery<{ issued_by: string | null; emitter_snapshot: unknown }>(
      `SELECT issued_by, emitter_snapshot FROM payment WHERE id = $1`,
      [paymentId],
    );

    // Re-entrega del render (equivale al re-encolado del barrido): sin sesión.
    const [row] = await testQuery<{ receipt_number: string }>(
      `SELECT receipt_number FROM payment WHERE id = $1`,
      [paymentId],
    );
    await handleReceiptRender(jobsEnv(tenant.owner), {
      type: 'receipt.render',
      scope: 'panel',
      paymentId,
      organizationId: tenant.organization.id,
      receiptNumber: row!.receipt_number,
    });

    const after = await testQuery<{ issued_by: string | null; emitter_snapshot: unknown }>(
      `SELECT issued_by, emitter_snapshot FROM payment WHERE id = $1`,
      [paymentId],
    );
    expect(after[0]!.issued_by).toBe(before[0]!.issued_by);
    expect(after[0]!.emitter_snapshot).toEqual(before[0]!.emitter_snapshot);
  });

  it('C1/C5: el reporte expone emisor congelado y actor', async () => {
    const { receiptNumber } = await emitReceipt();

    const res = await tenant.owner.client.get('/api/reports/receipts', {
      query: { status: 'all' },
    });
    expect(res.status, res.text).toBe(200);
    const body = res.body as {
      rows: Array<{ receiptNumber: string | null; issuedBy?: string | null; emitterName?: string | null }>;
    };
    const row = body.rows.find((r) => r.receiptNumber === receiptNumber);
    expect(row).toBeDefined();
    expect(row!.issuedBy).toBe(tenant.owner.userId);
    expect(row!.emitterName).toBe(tenant.organization.name);
  });
});
