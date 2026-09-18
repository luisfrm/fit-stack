/**
 * Fiscal por organización (Fase 4): `PATCH /api/organizations/profile`.
 *
 * Cubre: schema real de `fiscalConfig` (400), RBAC (cashier 403 / manager
 * 200), inmutables (`countryCode`/`primaryCurrency` → 400), fricción de
 * `isFormalTaxpayer` (solo transición false→true exige `confirmed`), merge
 * (no reemplazo ciego), override auditado y gate documental forzado.
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
  createOrganization,
  createPlan,
  isoDate,
  registerUser,
  setActiveOrganization,
  uid,
  uniqueEmail,
} from '../helpers/auth';
import {
  handleReceiptRender,
  type ReceiptHandlerEnv,
} from '../../../jobs-worker/src/handlers/receipt.handler';
import { ORG_ROLES } from '@workspace/shared';

describe.skipIf(skipReason !== null)('Organizations fiscal profile (Fase 4)', () => {
  beforeAll(async () => {
    await assertSchemaReady();
    await truncateAll();
  });

  async function createValidatedPayment(
    client: ReturnType<typeof createClient>,
    amountPaid = 10000,
  ) {    const member = await createGymMember(client);
    const plan = await createPlan(client, { price: amountPaid, currency: 'USD' });
    const res = await client.post('/api/subscriptions', {
      memberId: member.id,
      planId: plan.id,
      startDate: isoDate(0),
      endDate: isoDate(30),
      payment: {
        amountPaid,
        currencyPaid: 'USD',
        paymentMethod: 'cash',
        paymentMethodDetails: [],
        status: 'validated',
        paymentDate: isoDate(0),
      },
    });
    expect(res.status, res.text).toBe(201);
    const rows = await testQuery<Record<string, unknown>>(
      `SELECT * FROM payment WHERE subscription_id = $1`,
      [res.body.id],
    );
    return { member, plan, payment: rows[0]! };
  }

  it('rechaza fiscalConfig inválido con 400', async () => {
    const { owner } = await createGymTenant('fiscal-invalid');
    const res = await owner.client.patch('/api/organizations/profile', {
      fiscalConfig: { taxes: 'basura' },
    });
    expect(res.status, res.text).toBe(400);
  });

  it('cashier → 403, manager → 200', async () => {
    const { organization } = await createGymTenant('fiscal-rbac');
    const cashier = await addUserToOrganization(
      organization.id,
      ORG_ROLES.CASHIER,
      'fiscal-cashier',
    );
    const manager = await addUserToOrganization(
      organization.id,
      ORG_ROLES.MANAGER,
      'fiscal-manager',
    );

    const denied = await cashier.client.patch('/api/organizations/profile', {
      taxId: 'J-1',
    });
    expect(denied.status, denied.text).toBe(403);

    const allowed = await manager.client.patch('/api/organizations/profile', {
      taxId: 'J-1',
    });
    expect(allowed.status, allowed.text).toBe(200);
  });

  it('countryCode/primaryCurrency son inmutables (400 IMMUTABLE_FIELD)', async () => {
    const { owner } = await createGymTenant('fiscal-immutable');
    const res = await owner.client.patch('/api/organizations/profile', {
      countryCode: 'PE',
      primaryCurrency: 'PEN',
    });
    expect(res.status, res.text).toBe(400);
    expect(res.body).toMatchObject({ code: 'IMMUTABLE_FIELD' });
  });

  it('identidad de sede org-scoped: el owner guarda y persiste el set general', async () => {
    const { owner, organization } = await createGymTenant('org-identity');

    const res = await owner.client.patch('/api/organizations/profile', {
      name: 'Sede Renombrada',
      slogan: 'Tu mejor versión',
      logo: 'https://cdn.example.com/logo.png',
      timezone: 'America/Bogota',
      currencyFormat: 'usa',
      legalName: 'Sede Renombrada C.A.',
      taxId: 'J-99999999-9',
      address: 'Av. Siempre Viva 742',
    });
    expect(res.status, res.text).toBe(200);

    const rows = await testQuery<Record<string, unknown>>(
      `SELECT name, slogan, logo, timezone, currency_format, legal_name, tax_id, address
         FROM organization WHERE id = $1`,
      [organization.id],
    );
    expect(rows[0]).toMatchObject({
      name: 'Sede Renombrada',
      slogan: 'Tu mejor versión',
      logo: 'https://cdn.example.com/logo.png',
      timezone: 'America/Bogota',
      currency_format: 'usa',
      legal_name: 'Sede Renombrada C.A.',
      tax_id: 'J-99999999-9',
      address: 'Av. Siempre Viva 742',
    });
  });

  it('identidad de sede: slug duplicado → 409 SLUG_TAKEN', async () => {
    const first = await createGymTenant('org-slug-a');
    const second = await createGymTenant('org-slug-b');

    const res = await second.owner.client.patch('/api/organizations/profile', {
      slug: first.organization.slug,
    });
    expect(res.status, res.text).toBe(409);
    expect(res.body).toMatchObject({ code: 'SLUG_TAKEN' });
  });

  it('formal exige confirmed solo en la transición false→true', async () => {
    const { owner } = await createGymTenant('fiscal-formal');

    const missing = await owner.client.patch('/api/organizations/profile', {
      fiscalConfig: { isFormalTaxpayer: true },
    });
    expect(missing.status, missing.text).toBe(400);
    expect(missing.body).toMatchObject({
      code: 'FORMAL_TAXPAYER_CONFIRMATION_REQUIRED',
    });

    const confirmed = await owner.client.patch('/api/organizations/profile', {
      fiscalConfig: { isFormalTaxpayer: true },
      confirmed: true,
    });
    expect(confirmed.status, confirmed.text).toBe(200);

    // Ya formal: un PATCH posterior sin el flag no exige confirmación.
    const noop = await owner.client.patch('/api/organizations/profile', {
      address: 'Av. Principal',
    });
    expect(noop.status, noop.text).toBe(200);
  });

  it('merge parcial + receipt refleja disclaimer y etiqueta forzada', async () => {
    const { owner, organization } = await createGymTenant('fiscal-merge');

    const first = await owner.client.patch('/api/organizations/profile', {
      taxId: 'J-12345678-9',
      fiscalConfig: {
        isFormalTaxpayer: true,
        disclaimerOverride: ['Aviso custom de la sede'],
        taxes: [{ name: 'IVA', rate: 0.16, enabled: true }],
      },
      confirmed: true,
    });
    expect(first.status, first.text).toBe(200);

    // PATCH parcial de taxes[]: no debe borrar disclaimer ni formal.
    const second = await owner.client.patch('/api/organizations/profile', {
      fiscalConfig: { taxes: [{ name: 'IVA', rate: 0.1, enabled: true }] },
    });
    expect(second.status, second.text).toBe(200);

    const { payment } = await createValidatedPayment(owner.client);
    const paymentId = Number(payment['id']);
    const receiptNumber = payment['receipt_number'] as string;
    expect(receiptNumber).toMatch(
      new RegExp(`^${organization.slug}-\\d{4}-\\d{6}$`),
    );

    // Paso 2 real: el compose debe reflejar disclaimer custom y etiqueta
    // forzada ("Comprobante de pago" aunque haya taxId + formal).
    const env = owner.client.env as Record<string, unknown>;
    const jobsEnv: ReceiptHandlerEnv = {
      DATABASE_URL: TEST_DATABASE_URL,
      FILES_BUCKET: env['FILES_BUCKET'] as R2Bucket,
      TASK_QUEUE: env['TASK_QUEUE'] as Queue,
    };
    const rendered = await handleReceiptRender(jobsEnv, {
      type: 'receipt.render',
      scope: 'panel',
      paymentId,
      organizationId: organization.id,
      receiptNumber,
    });
    expect(rendered).toBe('completed');

    const receipt = await owner.client.get(`/api/payments/${paymentId}/receipt`);
    expect(receipt.status, receipt.text).toBe(200);
    expect(receipt.body).toMatchObject({
      available: true,
      pdfStatus: 'ready',
      receiptNumber,
    });
    expect(receipt.body.receipt.document.label).toBe('Comprobante de pago');
    expect(receipt.body.receipt.footer.disclaimer).toContain(
      'Aviso custom de la sede',
    );

    const rows = await testQuery<Record<string, unknown>>(
      `SELECT fiscal_config FROM organization WHERE id = $1`,
      [organization.id],
    );
    const fiscal = rows[0]!['fiscal_config'] as {
      isFormalTaxpayer?: boolean;
      disclaimerOverride?: string[];
      taxes?: Array<{ name: string; rate: number }>;
    };
    expect(fiscal.isFormalTaxpayer).toBe(true);
    expect(fiscal.disclaimerOverride).toEqual(['Aviso custom de la sede']);
    expect(fiscal.taxes?.find((t) => t.name === 'IVA')?.rate).toBe(0.1);
  });

  it('override sin motivo → 400; descuadre → 400', async () => {
    const { owner } = await createGymTenant('fiscal-override');
    const member = await createGymMember(owner.client);
    const plan = await createPlan(owner.client, { price: 10000, currency: 'USD' });
    const base = {
      memberId: member.id,
      planId: plan.id,
      startDate: isoDate(0),
      endDate: isoDate(30),
    };

    const noReason = await owner.client.post('/api/subscriptions', {
      ...base,
      payment: {
        amountPaid: 10000,
        currencyPaid: 'USD',
        paymentMethod: 'cash',
        paymentMethodDetails: [],
        status: 'validated',
        paymentDate: isoDate(0),
        taxTotal: 100,
        taxDetails: [{ name: 'IVA', rate: 0.16, amount: 100 }],
      },
    });
    expect(noReason.status, noReason.text).toBe(400);
    expect(noReason.body).toMatchObject({ code: 'TAX_OVERRIDE_REASON_REQUIRED' });

    const mismatch = await owner.client.post('/api/subscriptions', {
      ...base,
      payment: {
        amountPaid: 10000,
        currencyPaid: 'USD',
        paymentMethod: 'cash',
        paymentMethodDetails: [],
        status: 'validated',
        paymentDate: isoDate(0),
        taxTotal: 100,
        taxDetails: [{ name: 'IVA', rate: 0.16, amount: 50 }],
        taxOverrideReason: 'ajuste autorizado',
      },
    });
    expect(mismatch.status, mismatch.text).toBe(400);
    expect(mismatch.body).toMatchObject({ code: 'TAX_MISMATCH' });
  });

  it('PE formal muestra IGV; US no trae impuestos', async () => {
    async function taxedPayment(countryCode: string, amountPaid: number) {
      const tag = countryCode.toLowerCase();
      const user = await registerUser({ email: uniqueEmail(`fiscal-${tag}`) });
      const organization = await createOrganization(user.client, {
        countryCode,
        slug: `gym-fiscal-${tag}-${uid()}`,
      });
      await setActiveOrganization(user.client, organization.id);
      // C2: sin declaración de contribuyente formal no hay desglose.
      const declared = await user.client.patch('/api/organizations/profile', {
        fiscalConfig: { isFormalTaxpayer: true },
        confirmed: true,
      });
      expect(declared.status, declared.text).toBe(200);
      const { payment } = await createValidatedPayment(user.client, amountPaid);
      return payment;
    }

    const pe = await taxedPayment('PE', 11800);
    const peDetails = pe['tax_details'] as Array<{ name: string; amount: number }>;
    expect(peDetails.map((d) => d.name)).toEqual(['IGV']);
    expect(Number(pe['subtotal'])).toBe(10000);
    expect(Number(pe['tax_total'])).toBe(1800);

    const us = await taxedPayment('US', 5000);
    expect(us['tax_details']).toEqual([]);
    expect(Number(us['subtotal'])).toBe(5000);
    expect(Number(us['tax_total'])).toBe(0);
  });

  /**
   * C2 — invariante fail-closed (D6): el override solo puede REDUCIR carga
   * fiscal. Un no-contribuyente no puede activar impuestos (ni por config ni
   * por el override manual del pago) y un condicional exige confirmación.
   */
  it('activar impuestos sin declararse formal → 400 TAXES_REQUIRE_FORMAL_TAXPAYER', async () => {
    const { owner, organization } = await createGymTenant('fiscal-gate');

    const res = await owner.client.patch('/api/organizations/profile', {
      fiscalConfig: {
        taxes: [{ name: 'IVA', rate: 0.16, enabled: true }],
      },
    });
    expect(res.status, res.text).toBe(400);
    expect(res.body).toMatchObject({ code: 'TAXES_REQUIRE_FORMAL_TAXPAYER' });

    // El config almacenado NO cambió (fail-closed antes de persistir).
    const rows = await testQuery<{ fiscal_config: unknown }>(
      `SELECT fiscal_config FROM organization WHERE id = $1`,
      [organization.id],
    );
    expect(rows[0]!.fiscal_config ?? null).toBeNull();
  });

  it('condicional activado sin confirmar → 400 TAX_REQUIRES_CONFIRMATION', async () => {
    const { owner } = await createGymTenant('fiscal-conditional');

    const declared = await owner.client.patch('/api/organizations/profile', {
      fiscalConfig: { isFormalTaxpayer: true },
      confirmed: true,
    });
    expect(declared.status, declared.text).toBe(200);

    const unconfirmed = await owner.client.patch('/api/organizations/profile', {
      fiscalConfig: { taxes: [{ name: 'IGTF', rate: 0.03, enabled: true }] },
    });
    expect(unconfirmed.status, unconfirmed.text).toBe(400);
    expect(unconfirmed.body).toMatchObject({ code: 'TAX_REQUIRES_CONFIRMATION' });

    const confirmed = await owner.client.patch('/api/organizations/profile', {
      fiscalConfig: {
        confirmedTaxes: ['IGTF'],
        taxes: [
          { name: 'IVA', rate: 0.16, enabled: true },
          { name: 'IGTF', rate: 0.03, enabled: true },
        ],
      },
    });
    expect(confirmed.status, confirmed.text).toBe(200);
  });

  it('el override manual no puede inventar impuestos si no es formal', async () => {
    const { owner } = await createGymTenant('fiscal-override-informal');
    const member = await createGymMember(owner.client);
    const plan = await createPlan(owner.client, { price: 10000, currency: 'USD' });

    const res = await owner.client.post('/api/subscriptions', {
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
        subtotal: 9900,
        taxTotal: 100,
        taxDetails: [{ name: 'IVA', rate: 0.16, amount: 100 }],
        taxOverrideReason: 'ajuste autorizado por gerencia',
      },
    });
    expect(res.status, res.text).toBe(400);
    expect(res.body).toMatchObject({ code: 'TAXES_REQUIRE_FORMAL_TAXPAYER' });
  });
});
