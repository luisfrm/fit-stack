/**
 * Per-organization fiscal data.
 *
 * Contract (RD-145): `COUNTRIES` is the tax SINGLE SOURCE OF TRUTH and
 * `isFormalTaxpayer` is the only fiscal switch, writable EXCLUSIVELY from
 * Console (`PATCH /api/platform/organizations/:id`).
 *
 * - Tenant (`PATCH /api/organizations/profile`): edits issuer identity
 *   (`legalName`/`taxId`/`address`) and `disclaimerOverride`; any fiscal-regime
 *   key answers `403 FISCAL_CONFIG_PLATFORM_ONLY` with no partial write.
 * - Console: activating the regime requires a complete issuer identity
 *   (`400 FISCAL_IDENTITY_INCOMPLETE`, no partial write).
 * - `hasFiscalHomologation` left the contract (400), legacy tax lists are never
 *   accepted and the payment route computes the breakdown on the server.
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
  declareFormalTaxpayer,
  isoDate,
  registerPlatformUser,
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

describe.skipIf(skipReason !== null)('Organizations fiscal profile', () => {
  beforeAll(async () => {
    await assertSchemaReady();
    await truncateAll();
  });

  async function createValidatedPayment(
    client: ReturnType<typeof createClient>,
    amountPaid = 10000,
  ) {
    const member = await createGymMember(client);
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

  it('countryCode es inmutable (400 IMMUTABLE_FIELD); primaryCurrency ya no lo es', async () => {
    const { owner } = await createGymTenant('fiscal-immutable');
    const res = await owner.client.patch('/api/organizations/profile', {
      countryCode: 'PE',
    });
    expect(res.status, res.text).toBe(400);
    expect(res.body).toMatchObject({
      code: 'IMMUTABLE_FIELD',
      fields: ['countryCode'],
    });
  });

  it('tipo de documento de otro país → 400 DOCUMENT_TYPE_INVALID (RD-148)', async () => {
    const { owner, organization } = await createGymTenant('fiscal-doctype');

    const before = await testQuery<{ tax_id: string | null }>(
      `SELECT tax_id FROM organization WHERE id = $1`,
      [organization.id],
    );

    // VE tenant: `C.C.` is a CO prefix, never part of the VE catalog.
    const res = await owner.client.patch('/api/organizations/profile', {
      taxId: 'C.C.-12345678',
    });
    expect(res.status, res.text).toBe(400);
    expect(res.body).toMatchObject({
      code: 'DOCUMENT_TYPE_INVALID',
      fields: ['taxId'],
    });

    // Rejected before any write.
    const after = await testQuery<{ tax_id: string | null }>(
      `SELECT tax_id FROM organization WHERE id = $1`,
      [organization.id],
    );
    expect(after[0]!.tax_id).toBe(before[0]!.tax_id);

    // A prefix of the org country is accepted.
    const ok = await owner.client.patch('/api/organizations/profile', {
      taxId: 'J-12345678-9',
    });
    expect(ok.status, ok.text).toBe(200);
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
      `SELECT name, slogan, logo, timezone, currency_format, legal_name, tax_id, address, fiscal_config
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
      // Identity edits never declare the fiscal regime: platform-only.
      fiscal_config: null,
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

  it('el tenant no puede escribir el régimen fiscal → 403 FISCAL_CONFIG_PLATFORM_ONLY', async () => {
    const { owner, organization } = await createGymTenant('fiscal-tenant-forbidden');

    // Every platform-owned key (and the legacy tax lists) answers 403 instead
    // of a silent strip, naming the offending fields.
    const forbiddenPayloads: Array<Record<string, unknown>> = [
      { isFormalTaxpayer: true },
      { taxes: [] },
      { confirmedTaxes: ['IGTF'] },
    ];
    for (const payload of forbiddenPayloads) {
      const key = Object.keys(payload)[0]!;
      const res = await owner.client.patch('/api/organizations/profile', {
        fiscalConfig: payload,
      });
      expect(res.status, `${key}: ${res.text}`).toBe(403);
      expect(res.body).toMatchObject({
        code: 'FISCAL_CONFIG_PLATFORM_ONLY',
        fields: [key],
      });
    }

    // A `null` reset would also wipe the platform-governed regime.
    const reset = await owner.client.patch('/api/organizations/profile', {
      fiscalConfig: null,
    });
    expect(reset.status, reset.text).toBe(403);
    expect(reset.body).toMatchObject({
      code: 'FISCAL_CONFIG_PLATFORM_ONLY',
      fields: ['fiscalConfig'],
    });

    // No partial write: the tenant scalars sent alongside are not persisted.
    const mixed = await owner.client.patch('/api/organizations/profile', {
      legalName: 'No debe persistir C.A.',
      fiscalConfig: { isFormalTaxpayer: true },
    });
    expect(mixed.status, mixed.text).toBe(403);

    const rows = await testQuery<Record<string, unknown>>(
      `SELECT legal_name, tax_id, address, fiscal_config FROM organization WHERE id = $1`,
      [organization.id],
    );
    expect(rows[0]).toMatchObject({
      legal_name: null,
      tax_id: null,
      address: null,
      fiscal_config: null,
    });
  });

  it('el tenant edita identidad y disclaimer; el régimen de Console sobrevive al merge', async () => {
    const { owner, organization } = await createGymTenant('fiscal-tenant-identity');
    await declareFormalTaxpayer(organization.id);

    const res = await owner.client.patch('/api/organizations/profile', {
      legalName: 'Gym Legal C.A.',
      taxId: 'J-12345678-9',
      address: 'Av. 1',
      fiscalConfig: { disclaimerOverride: ['Aviso de la sede'] },
    });
    expect(res.status, res.text).toBe(200);

    const rows = await testQuery<Record<string, unknown>>(
      `SELECT legal_name, tax_id, address, fiscal_config FROM organization WHERE id = $1`,
      [organization.id],
    );
    expect(rows[0]).toMatchObject({
      legal_name: 'Gym Legal C.A.',
      tax_id: 'J-12345678-9',
      address: 'Av. 1',
    });
    // Partial PATCH: the tenant-owned disclaimer is merged in, the
    // platform-owned declaration is preserved (never blind replacement).
    expect(rows[0]!['fiscal_config']).toEqual({
      isFormalTaxpayer: true,
      disclaimerOverride: ['Aviso de la sede'],
    });
  });

  it('Console exige identidad fiscal completa para activar el régimen → 400 FISCAL_IDENTITY_INCOMPLETE', async () => {
    const { organization } = await createGymTenant('fiscal-console-incomplete');
    const admin = await registerPlatformUser('admin');

    const res = await admin.client.patch(
      `/api/platform/organizations/${organization.id}`,
      {
        legalName: 'Gym Incompleto C.A.',
        fiscalConfig: { isFormalTaxpayer: true },
      },
    );
    expect(res.status, res.text).toBe(400);
    expect(res.body).toMatchObject({
      code: 'FISCAL_IDENTITY_INCOMPLETE',
      fields: ['taxId', 'address'],
    });

    // Fail-closed: neither the regime nor the identity was persisted.
    const rows = await testQuery<Record<string, unknown>>(
      `SELECT legal_name, tax_id, address, fiscal_config FROM organization WHERE id = $1`,
      [organization.id],
    );
    expect(rows[0]).toMatchObject({
      legal_name: null,
      tax_id: null,
      address: null,
      fiscal_config: null,
    });
  });

  it('Console activa con identidad completa: el desglose sale de COUNTRIES', async () => {
    const { owner, organization } = await createGymTenant('fiscal-console-activate');
    await declareFormalTaxpayer(organization.id);

    const { payment } = await createValidatedPayment(owner.client, 10000);
    const details = payment['tax_details'] as Array<{ name: string; amount: number }>;
    // VE + USD: IVA 16% (country) + IGTF 3% (conditional, foreign currency).
    expect(details.map((d) => d.name).sort()).toEqual(['IGTF', 'IVA']);

    const subtotal = Number(payment['subtotal']);
    const taxTotal = Number(payment['tax_total']);
    const summedDetails = details.reduce((sum, d) => sum + d.amount, 0);
    expect(taxTotal).toBe(summedDetails);
    expect(subtotal + taxTotal).toBe(10000);
  });

  it('`hasFiscalHomologation` salió del contrato → 400 (tenant y Console)', async () => {
    const { owner, organization } = await createGymTenant('fiscal-homologation');

    const tenant = await owner.client.patch('/api/organizations/profile', {
      fiscalConfig: { hasFiscalHomologation: true },
    });
    expect(tenant.status, tenant.text).toBe(400);

    const admin = await registerPlatformUser('admin');
    const platform = await admin.client.patch(
      `/api/platform/organizations/${organization.id}`,
      { fiscalConfig: { hasFiscalHomologation: true } },
    );
    expect(platform.status, platform.text).toBe(400);
  });

  it('el desglose enviado por el cliente se ignora: siempre se calcula en el servidor', async () => {
    const { owner } = await createGymTenant('fiscal-manual-breakdown');
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
        // Legacy override fields: unknown to the write contract, never applied.
        subtotal: 9900,
        taxTotal: 100,
        taxDetails: [{ name: 'IVA', rate: 0.16, amount: 100 }],
        taxOverrideReason: 'ajuste autorizado',
      },
    });
    expect(res.status, res.text).toBe(201);

    const rows = await testQuery<Record<string, unknown>>(
      `SELECT subtotal, tax_total, tax_details, tax_override_reason
         FROM payment WHERE subscription_id = $1`,
      [res.body.id],
    );
    // Not a formal taxpayer → the whole charge is the subtotal, no taxes.
    expect(rows[0]).toMatchObject({
      tax_details: [],
      tax_override_reason: null,
    });
    expect(Number(rows[0]!['subtotal'])).toBe(10000);
    expect(Number(rows[0]!['tax_total'])).toBe(0);
  });

  it('formal PE muestra IGV; US no trae impuestos', async () => {
    async function taxedPayment(countryCode: string, amountPaid: number) {
      const tag = countryCode.toLowerCase();
      const user = await registerUser({ email: uniqueEmail(`fiscal-${tag}`) });
      const organization = await createOrganization(user.client, {
        countryCode,
        slug: `gym-fiscal-${tag}-${uid()}`,
      });
      await setActiveOrganization(user.client, organization.id);
      // The regime is declared from Console; the tenant cannot do it.
      await declareFormalTaxpayer(organization.id);
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

  it('el comprobante refleja el disclaimer de la sede y la etiqueta forzada', async () => {
    const { owner, organization } = await createGymTenant('fiscal-receipt');
    await declareFormalTaxpayer(organization.id);

    const custom = await owner.client.patch('/api/organizations/profile', {
      fiscalConfig: { disclaimerOverride: ['Aviso custom de la sede'] },
    });
    expect(custom.status, custom.text).toBe(200);

    const { payment } = await createValidatedPayment(owner.client, 11800);
    const paymentId = Number(payment['id']);
    const receiptNumber = payment['receipt_number'] as string;
    expect(receiptNumber).toMatch(new RegExp(`^\\d{4}-\\d{6}$`));

    // Real step 2: the compose must reflect the custom disclaimer and the
    // forced label ("Comprobante de pago" even with taxId + formal).
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

    const rows = await testQuery<{ fiscal_config: Record<string, unknown> }>(
      `SELECT fiscal_config FROM organization WHERE id = $1`,
      [organization.id],
    );
    const fiscal = rows[0]!.fiscal_config;
    expect(fiscal).toEqual({
      isFormalTaxpayer: true,
      disclaimerOverride: ['Aviso custom de la sede'],
    });
    // COUNTRIES is the tax SSOT: no per-org tax list is ever stored.
    expect(fiscal['taxes']).toBeUndefined();
  });
});
