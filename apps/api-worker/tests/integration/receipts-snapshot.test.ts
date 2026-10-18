/**
 * Issuer snapshot + emission traceability.
 *
 * `GET /:id/receipt` must ALWAYS return what was issued. The test issues,
 * changes the issuer profile (legal name, RIF, address, country and
 * `fiscalConfig`) and requests the receipt again: it has to be identical.
 * `issued_by` is the session actor that numbered it; step 2 (consumer, with no
 * session) never overwrites it nor invents one.
 *
 * Standard pattern: real HTTP + Neon branch (`TEST_DATABASE_URL`), graceful
 * skip without the variable, `truncateAll` per file.
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

describe.skipIf(skipReason !== null)('Receipt snapshot + issued_by', () => {
  let tenant: GymTenant;

  beforeAll(async () => {
    await assertSchemaReady();
    await truncateAll();
    tenant = await createGymTenant('snapshot');
  });

  function jobsEnv(owner: AuthedUser): ReceiptHandlerEnv {
    const env = owner.client.env as Record<string, unknown>;
    return {
      DATABASE_URL: TEST_DATABASE_URL,
      FILES_BUCKET: env['FILES_BUCKET'] as R2Bucket,
      TASK_QUEUE: env['TASK_QUEUE'] as Queue,
    };
  }

  /** `validated` payment via API (numbers in the same request) + real step 2. */
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

  it('editar el perfil del emisor no cambia el comprobante ya emitido', async () => {
    const { paymentId } = await emitReceipt();
    const asIssued = await getReceipt(paymentId);

    // The gym changes EVERYTHING that used to be read live: legal name, RIF,
    // address, country and fiscal declaration (with the breakdown enabled).
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
    // Sanity: the live row DID change (the snapshot is what freezes the JSON).
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
    // The session actor that issued it.
    expect(row!.issued_by).toBe(tenant.owner.userId);
  });

  it('la emisión manual también deja actor', async () => {
    // Validated payment WITHOUT a number (legacy): `POST /:id/issue` numbers it and sets the actor.
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

  it('paso 2 (sin sesión) no pisa la auditoría de la emisión', async () => {
    const { paymentId } = await emitReceipt();
    const before = await testQuery<{ issued_by: string | null; emitter_snapshot: unknown }>(
      `SELECT issued_by, emitter_snapshot FROM payment WHERE id = $1`,
      [paymentId],
    );

    // Re-delivery of the render (equivalent to the sweep's re-enqueue): no session.
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

  it('el reporte expone emisor congelado y actor', async () => {
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
