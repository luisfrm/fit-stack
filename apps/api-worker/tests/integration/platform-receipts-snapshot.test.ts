/**
 * SaaS issuer snapshot + `issued_by` — mirror of the Panel.
 *
 * The issuer is FitStack (`platform_setting`) and the recipient is the organization.
 * Issue, change the issuer identity and the recipient config, and request the
 * receipt again: it must still be the one issued.
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
  createGymTenant,
  registerPlatformUser,
  uid,
  isoDate,
  type AuthedUser,
} from '../helpers/auth';
import {
  handlePlatformReceiptRender,
  type ReceiptHandlerEnv,
} from '../../../jobs-worker/src/handlers/receipt.handler';

describe.skipIf(skipReason !== null)('Platform receipt snapshot + issued_by', () => {
  let admin: AuthedUser;
  let tenant: Awaited<ReturnType<typeof createGymTenant>>;
  let plan: { id: number };

  beforeAll(async () => {
    await assertSchemaReady();
    await truncateAll();
    admin = await registerPlatformUser('admin');
    tenant = await createGymTenant('c1p');
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

  function jobsEnv(): ReceiptHandlerEnv {
    const env = admin.client.env as Record<string, unknown>;
    return {
      DATABASE_URL: TEST_DATABASE_URL,
      FILES_BUCKET: env['FILES_BUCKET'] as R2Bucket,
      TASK_QUEUE: env['TASK_QUEUE'] as Queue,
    };
  }

  /** SaaS creation with a validated payment (numbers `FS-N`) + real step 2 (PDF). */
  async function emitReceipt(): Promise<{ paymentId: number; receiptNumber: string }> {
    const res = await admin.client.post('/api/platform/subscriptions', {
      organizationId: tenant.organization.id,
      planId: plan.id,
      startDate: isoDate(0),
      isTrial: false,
      payment: {
        amountPaidCents: 5000,
        currencyPaid: 'USD',
        baseAmountCents: 5000,
        paymentMethod: 'zelle',
        paymentMethodDetails: [],
        status: 'validated',
        paymentDate: isoDate(0),
      },
    });
    expect(res.status, res.text).toBe(201);
    const [row] = await testQuery<{ id: number; receipt_number: string }>(
      `SELECT id, receipt_number FROM platform_subscription_payment
       WHERE subscription_id = $1 ORDER BY id DESC LIMIT 1`,
      [res.body.id],
    );
    const paymentId = Number(row!.id);
    const rendered = await handlePlatformReceiptRender(jobsEnv(), {
      type: 'receipt.render',
      scope: 'platform',
      paymentId,
      organizationId: tenant.organization.id,
      receiptNumber: row!.receipt_number,
    });
    expect(rendered).toBe('completed');
    return { paymentId, receiptNumber: row!.receipt_number };
  }

  async function getReceipt(paymentId: number) {
    const res = await admin.client.get(
      `/api/platform/subscriptions/payments/${paymentId}/receipt`,
    );
    expect(res.status, res.text).toBe(200);
    return res.body as {
      receipt: {
        emitter: { name: string; taxId: string | null; address: string | null; countryCode: string };
        document: { label: string };
        footer: { disclaimer: string[] };
      };
    };
  }

  it('la identidad de FitStack queda congelada por comprobante', async () => {
    const { paymentId } = await emitReceipt();
    const asIssued = await getReceipt(paymentId);
    expect(asIssued.receipt.emitter.name).toBe('FitStack');

    // Changes the issuer (settings) and the recipient (country/tz).
    await testQuery(
      `INSERT INTO platform_setting (key, value) VALUES ('fitstack_legal_name', 'FitStack Colombia S.A.S.')
       ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`,
    );
    await testQuery(
      `INSERT INTO platform_setting (key, value) VALUES ('fitstack_tax_id', 'NIT-999')
       ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`,
    );
    await testQuery(
      `INSERT INTO platform_setting (key, value) VALUES ('fitstack_country_code', 'CO')
       ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`,
    );
    await testQuery(`UPDATE organization SET country_code = 'CO' WHERE id = $1`, [
      tenant.organization.id,
    ]);

    const after = await getReceipt(paymentId);
    expect(after.receipt.emitter).toEqual(asIssued.receipt.emitter);
    expect(after.receipt.footer.disclaimer).toEqual(asIssued.receipt.footer.disclaimer);
    expect(after.receipt.document.label).toBe(asIssued.receipt.document.label);

    const [row] = await testQuery<{ emitter_snapshot: unknown; issued_by: string | null }>(
      `SELECT emitter_snapshot, issued_by FROM platform_subscription_payment WHERE id = $1`,
      [paymentId],
    );
    expect(row!.emitter_snapshot).not.toBeNull();
    expect(row!.issued_by).toBe(admin.userId);
  });

  it('pago legacy (snapshot NULL) sigue componiendo en vivo', async () => {
    const { paymentId } = await emitReceipt();
    // Legacy payment: the documented terminal state is forced.
    await testQuery(
      `UPDATE platform_subscription_payment SET emitter_snapshot = NULL WHERE id = $1`,
      [paymentId],
    );

    const data = await getReceipt(paymentId);
    // The live issuer is already the Colombian one (settings from the previous test).
    expect(data.receipt.emitter.name).toBe('FitStack Colombia S.A.S.');
    expect(data.receipt.emitter.countryCode).toBe('CO');
  });

  it('el reporte SaaS expone actor y emisor congelado', async () => {
    const { receiptNumber } = await emitReceipt();

    const res = await admin.client.get('/api/platform/subscriptions/receipts', {
      query: { status: 'all' },
    });
    expect(res.status, res.text).toBe(200);
    const body = res.body as {
      rows: Array<{
        receiptNumber: string | null;
        issuedBy?: string | null;
        emitterName?: string | null;
      }>;
    };
    const row = body.rows.find((r) => r.receiptNumber === receiptNumber);
    expect(row).toBeDefined();
    expect(row!.issuedBy).toBe(admin.userId);
    expect(row!.emitterName).toBe('FitStack Colombia S.A.S.');
  });
});
