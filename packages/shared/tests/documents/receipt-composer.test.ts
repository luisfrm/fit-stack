/**
 * Parity suite for the unified receipt composer.
 *
 * Oracle strategy: this file carries a VERBATIM frozen copy of the
 * pre-unification code path — the legacy call-site row mapping (formerly
 * inlined four times in jobs-worker/api-worker) plus the legacy composition
 * builders, including their private date/base-total helpers. The new
 * `composePanelReceipt` / `composePlatformReceipt` path must return a
 * `ReceiptData` IDENTICAL (`toEqual`) to that frozen path for the full
 * fixture set of both issuers.
 *
 * Do NOT edit the legacy* functions: they are the parity oracle that keeps
 * the later receipt-engine refactors honest. New fixtures are welcome.
 */
import { describe, expect, it } from 'vitest';
import {
  assertEmitterSnapshot,
  assertPersistedTaxDetails,
  buildEmitterSnapshot,
  buildPlatformEmitterSnapshot,
  platformEmitterFromSettings,
  toReceiptMaskedDetails,
  type ComposeReceiptInput,
  type DateInput,
  type PlatformComposeReceiptInput,
} from '../../src/documents/receipt-compose';
import {
  composePanelReceipt,
  composePlatformReceipt,
  type PanelReceiptComposedRows,
  type PlatformReceiptComposedRows,
} from '../../src/documents/receipt-composer';
import { resolveFiscalProfile } from '../../src/documents/fiscal-profile';
import { maskPaymentDetails } from '../../src/documents/masking';
import { roundCents } from '../../src/documents/tax-math';
import type { ReceiptData } from '../../src/documents/receipt-data';
import type { IPaymentMethodDetails } from '../../src/types';

/* ── Frozen legacy oracle (verbatim pre-unification code) ────────────────
   Copied from the former inline mapping in the jobs-worker render handler
   and the former bodies of buildReceiptDataFromComposed /
   buildPlatformReceiptDataFromComposed. Only the private helpers were
   inlined under a legacy* name; behavior and error strings are untouched.
   ─────────────────────────────────────────────────────────────────────── */

function legacyToIso(value: DateInput): string {
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) {
    throw new TypeError(`buildReceiptDataFromComposed: fecha inválida (${String(value)}).`);
  }
  return d.toISOString();
}

function legacyToBaseTotal(
  total: number,
  currencyPaid: string,
  baseCurrency: string | null | undefined,
  exchangeRateApplied: string | null | undefined,
): number | null {
  if (!baseCurrency || baseCurrency === currencyPaid) return null;
  const rate = Number(exchangeRateApplied);
  if (!Number.isFinite(rate) || rate <= 0) return null;
  return roundCents(total / rate);
}

function legacyBuildReceiptDataFromComposed(input: ComposeReceiptInput): ReceiptData {
  const { payment, organization, member, subscription } = input;

  if (payment.subtotal == null || payment.taxTotal == null) {
    throw new Error(
      'buildReceiptDataFromComposed: impuestos no persistidos en el pago (subtotal/tax_total ausentes).',
    );
  }
  const taxDetails = assertPersistedTaxDetails(payment.taxDetails, 'buildReceiptDataFromComposed');

  const baseCurrency = payment.planSnapshotCurrency ?? organization.primaryCurrency;
  const identity =
    assertEmitterSnapshot(input.emitterSnapshot, 'buildReceiptDataFromComposed') ??
    buildEmitterSnapshot(
      organization,
      resolveFiscalProfile(organization.countryCode, organization.fiscalConfig),
    );

  const masked = maskPaymentDetails(
    payment.paymentMethodDetails as
      | IPaymentMethodDetails
      | Record<string, unknown>
      | null
      | undefined,
  );
  const maskedDetails = toReceiptMaskedDetails(masked);

  const memberName = member
    ? `${member.firstName ?? ''} ${member.lastName ?? ''}`.trim() || 'Miembro'
    : 'Miembro';

  return {
    emitter: identity.emitter,
    recipient: {
      name: memberName,
      documentId: member?.documentId ?? null,
      docLabel: identity.recipientDocLabel,
    },
    document: {
      number: input.receiptNumber,
      type: input.documentType,
      label: identity.documentLabel,
      issuedAt: legacyToIso(input.issuedAt),
    },
    sale: {
      planName: payment.planSnapshotName?.trim() || 'Plan de membresía',
      periodStart: subscription?.startDate ? legacyToIso(subscription.startDate) : legacyToIso(input.issuedAt),
      periodEnd: subscription?.endDate ? legacyToIso(subscription.endDate) : legacyToIso(input.issuedAt),
      paymentDate: legacyToIso(payment.paymentDate),
    },
    amounts: {
      subtotal: payment.subtotal,
      taxDetails,
      taxTotal: payment.taxTotal,
      total: payment.amountPaid,
      currencyPaid: payment.currencyPaid,
      baseCurrency,
      exchangeRateApplied: payment.exchangeRateApplied ?? null,
      baseTotal: legacyToBaseTotal(
        payment.amountPaid,
        payment.currencyPaid,
        baseCurrency,
        payment.exchangeRateApplied,
      ),
    },
    method: {
      name: payment.paymentMethod,
      maskedDetails,
    },
    footer: {
      disclaimer: identity.disclaimer,
      generatedBy: 'Generado con FitStack',
    },
    timezone: identity.timezone ?? undefined,
    voided: payment.receiptVoided ?? false,
    internalPaymentId: payment.id,
  };
}

function legacyBuildPlatformReceiptDataFromComposed(
  input: PlatformComposeReceiptInput,
): ReceiptData {
  const { payment, subscription, receptor, emitter } = input;

  if (payment.subtotal == null || payment.taxTotal == null) {
    throw new Error(
      'buildPlatformReceiptDataFromComposed: impuestos no persistidos en el pago (subtotal/tax_total ausentes).',
    );
  }
  const taxDetails = assertPersistedTaxDetails(
    payment.taxDetails,
    'buildPlatformReceiptDataFromComposed',
  );

  const identity =
    assertEmitterSnapshot(input.emitterSnapshot, 'buildPlatformReceiptDataFromComposed') ??
    buildPlatformEmitterSnapshot(
      { receptor, emitter, currency: payment.planSnapshotCurrency },
      resolveFiscalProfile(receptor.countryCode),
    );

  const masked = maskPaymentDetails(
    payment.paymentMethodDetails as
      | IPaymentMethodDetails
      | Record<string, unknown>
      | null
      | undefined,
  );
  const maskedDetails = toReceiptMaskedDetails(masked);

  const periodStart = subscription?.startDate ?? payment.paymentDate;
  const periodEnd = subscription?.currentPeriodEnd ?? periodStart;

  return {
    emitter: identity.emitter,
    recipient: {
      name: receptor.legalName?.trim() || receptor.name,
      documentId: receptor.taxId?.trim() || null,
      docLabel: identity.recipientDocLabel,
    },
    document: {
      number: input.receiptNumber,
      type: 'receipt',
      label: identity.documentLabel,
      issuedAt: legacyToIso(input.issuedAt),
    },
    sale: {
      planName: payment.planSnapshotName?.trim() || 'Plan de suscripción',
      periodStart: legacyToIso(periodStart),
      periodEnd: legacyToIso(periodEnd),
      paymentDate: legacyToIso(payment.paymentDate),
    },
    amounts: {
      subtotal: payment.subtotal,
      taxDetails,
      taxTotal: payment.taxTotal,
      total: payment.amountPaid,
      currencyPaid: payment.currencyPaid,
      baseCurrency: payment.planSnapshotCurrency,
      exchangeRateApplied: payment.exchangeRateApplied ?? null,
      baseTotal: legacyToBaseTotal(
        payment.amountPaid,
        payment.currencyPaid,
        payment.planSnapshotCurrency,
        payment.exchangeRateApplied,
      ),
    },
    method: {
      name: payment.paymentMethod,
      maskedDetails,
    },
    footer: {
      disclaimer: identity.disclaimer,
      generatedBy: 'Generado con FitStack',
    },
    timezone: identity.timezone ?? undefined,
    voided: payment.voided,
    internalPaymentId: payment.id,
  };
}

/** Verbatim copy of the former jobs-worker panel row mapping. */
function legacyPanelRowsToInput(rows: PanelReceiptComposedRows): ComposeReceiptInput {
  const { payment, organization, member, subscription } = rows;
  const persistedNumber = payment.receiptNumber!;
  return {
    receiptNumber: persistedNumber,
    documentType: payment.documentType === 'invoice' ? 'invoice' : 'receipt',
    issuedAt: payment.receiptIssuedAt!,
    payment: {
      id: payment.id,
      amountPaid: Number(payment.amountPaid),
      currencyPaid: payment.currencyPaid,
      exchangeRateApplied: payment.exchangeRateApplied,
      paymentMethod: payment.paymentMethod,
      paymentMethodDetails: payment.paymentMethodDetails,
      paymentDate: payment.paymentDate,
      subtotal: payment.subtotal != null ? Number(payment.subtotal) : null,
      taxTotal: payment.taxTotal != null ? Number(payment.taxTotal) : null,
      taxDetails: payment.taxDetails,
      receiptNumber: persistedNumber,
      receiptVoided: payment.receiptVoided,
      planSnapshotName: payment.planSnapshotName,
      planSnapshotCurrency: payment.planSnapshotCurrency,
    },
    organization: {
      name: organization.name,
      legalName: organization.legalName,
      taxId: organization.taxId,
      address: organization.address,
      countryCode: organization.countryCode,
      primaryCurrency: organization.primaryCurrency,
      timezone: organization.timezone,
      fiscalConfig: organization.fiscalConfig,
    },
    member: member
      ? {
          firstName: member.firstName,
          lastName: member.lastName,
          documentId: member.documentId,
        }
      : null,
    subscription: subscription
      ? {
          startDate: subscription.startDate,
          endDate: subscription.endDate,
        }
      : null,
    emitterSnapshot: payment.emitterSnapshot,
  };
}

/** Verbatim copy of the former jobs-worker platform row mapping. */
function legacyPlatformRowsToInput(
  rows: PlatformReceiptComposedRows,
): PlatformComposeReceiptInput {
  const { payment, subscription, organization, emitter } = rows;
  return {
    receiptNumber: payment.receiptNumber!,
    issuedAt: payment.receiptIssuedAt!,
    payment: {
      id: payment.id,
      amountPaid: Number(payment.amountPaid),
      currencyPaid: payment.currencyPaid,
      exchangeRateApplied: payment.exchangeRateApplied,
      paymentMethod: payment.paymentMethod,
      paymentMethodDetails: payment.paymentMethodDetails,
      paymentDate: payment.paymentDate,
      subtotal: payment.subtotal != null ? Number(payment.subtotal) : null,
      taxTotal: payment.taxTotal != null ? Number(payment.taxTotal) : null,
      taxDetails: payment.taxDetails,
      planSnapshotName: payment.planSnapshotName,
      planSnapshotCurrency: payment.planSnapshotCurrency,
      voided: payment.receiptVoided,
    },
    subscription: subscription
      ? {
          startDate: subscription.startDate,
          currentPeriodEnd: subscription.currentPeriodEnd,
        }
      : null,
    receptor: {
      name: organization.name,
      legalName: organization.legalName,
      taxId: organization.taxId,
      countryCode: organization.countryCode,
      timezone: organization.timezone,
    },
    emitter: platformEmitterFromSettings(emitter),
    emitterSnapshot: payment.emitterSnapshot,
  };
}

/* ── Fixtures (full set, both issuers) ─────────────────────────────────── */

function basePanelRows(): PanelReceiptComposedRows {
  return {
    payment: {
      id: 42,
      amountPaid: 11600,
      currencyPaid: 'VES',
      exchangeRateApplied: null,
      paymentMethod: 'Transferencia',
      paymentMethodDetails: [{ label: 'Referencia', value: '123456789012', type: 'text' }],
      paymentDate: new Date('2026-09-11T09:00:00.000Z'),
      subtotal: 10000,
      taxTotal: 1600,
      taxDetails: [{ name: 'IVA', rate: 0.16, amount: 1600 }],
      receiptNumber: 'fit-stack-2026-000045',
      documentType: 'receipt',
      receiptIssuedAt: new Date('2026-09-11T10:00:00.000Z'),
      receiptVoided: false,
      planSnapshotName: 'Plan Mensual',
      planSnapshotCurrency: 'VES',
      emitterSnapshot: null,
    },
    organization: {
      name: 'Gym Fit Stack',
      legalName: 'Fit Stack C.A.',
      taxId: 'J-12345678-9',
      address: 'Caracas',
      countryCode: 'VE',
      primaryCurrency: 'VES',
      timezone: 'America/Caracas',
      fiscalConfig: undefined,
    },
    member: { firstName: 'Juan', lastName: 'Pérez', documentId: 'V-12345678' },
    subscription: {
      startDate: new Date('2026-09-01T00:00:00.000Z'),
      endDate: new Date('2026-09-30T23:59:59.000Z'),
    },
  };
}

function basePlatformRows(): PlatformReceiptComposedRows {
  return {
    payment: {
      id: 7,
      amountPaid: 5000,
      currencyPaid: 'USD',
      exchangeRateApplied: null,
      paymentMethod: 'zelle',
      paymentMethodDetails: [{ label: 'Referencia', value: 'ABC123456', type: 'text' }],
      paymentDate: new Date('2026-09-14T10:00:00.000Z'),
      subtotal: 4202,
      taxTotal: 798,
      taxDetails: [
        { name: 'IVA', rate: 0.16, amount: 672 },
        { name: 'IGTF', rate: 0.03, amount: 126 },
      ],
      receiptNumber: 'FS-0000042',
      receiptIssuedAt: new Date('2026-09-15T12:00:00.000Z'),
      receiptVoided: false,
      planSnapshotName: 'Plan SaaS',
      planSnapshotCurrency: 'USD',
      emitterSnapshot: null,
    },
    subscription: {
      startDate: new Date('2026-09-14T00:00:00.000Z'),
      currentPeriodEnd: new Date('2026-10-14T00:00:00.000Z'),
    },
    organization: {
      name: 'Gym Demo',
      legalName: 'Gimnasio Demo C.A.',
      taxId: 'J-999',
      countryCode: 'VE',
      timezone: 'America/Caracas',
    },
    emitter: {
      fitstack_legal_name: 'FitStack C.A.',
      fitstack_tax_id: 'J-123',
      fitstack_address: 'Av. Principal',
      fitstack_country_code: 'VE',
    },
  };
}

/* ── Panel issuer ──────────────────────────────────────────────────────── */

describe('composePanelReceipt (parity with the frozen legacy path)', () => {
  function expectPanelParity(rows: PanelReceiptComposedRows): void {
    expect(composePanelReceipt(rows)).toEqual(
      legacyBuildReceiptDataFromComposed(legacyPanelRowsToInput(rows)),
    );
  }

  it('happy path: member, subscription, taxes, text details', () => {
    const rows = basePanelRows();
    expectPanelParity(rows);
    expect(composePanelReceipt(rows).document.number).toBe('fit-stack-2026-000045');
  });

  it('currency conversion: baseTotal from the persisted rate', () => {
    const rows = basePanelRows();
    rows.payment = {
      ...rows.payment,
      amountPaid: 7300,
      subtotal: 7300,
      taxTotal: 0,
      taxDetails: [],
      currencyPaid: 'VES',
      planSnapshotCurrency: 'USD',
      exchangeRateApplied: '36.5',
    };
    expectPanelParity(rows);
  });

  it('missing member falls back to the walk-in recipient', () => {
    const rows = basePanelRows();
    rows.member = null;
    expectPanelParity(rows);
  });

  it('missing subscription falls back to the issue date period', () => {
    const rows = basePanelRows();
    rows.subscription = null;
    expectPanelParity(rows);
  });

  it('voided payment keeps the number and the voided flag', () => {
    const rows = basePanelRows();
    rows.payment = { ...rows.payment, receiptVoided: true };
    expectPanelParity(rows);
  });

  it('frozen emitter snapshot wins over the edited live organization', () => {
    const rows = basePanelRows();
    rows.payment = {
      ...rows.payment,
      emitterSnapshot: buildEmitterSnapshot(
        rows.organization,
        resolveFiscalProfile('VE', { isFormalTaxpayer: true }),
      ),
    };
    rows.organization = {
      ...rows.organization,
      legalName: 'Otro Nombre C.A.',
      taxId: 'J-99999999-9',
      address: 'Otra dirección',
    };
    expectPanelParity(rows);
  });

  it('file-type payment details stay out of the masked receipt text', () => {
    const rows = basePanelRows();
    rows.payment = {
      ...rows.payment,
      paymentMethod: 'Binance',
      paymentMethodDetails: [
        { type: 'text', label: 'Usuario remitente', value: 'luisfrm_@outlook.com' },
        {
          type: 'file',
          label: 'Recibo',
          value: 'cdab3d7b/receipts/doc.png',
        },
      ],
    };
    expectPanelParity(rows);
  });

  it("document_type 'invoice' maps through to document.type", () => {
    const rows = basePanelRows();
    rows.payment = { ...rows.payment, documentType: 'invoice' };
    expectPanelParity(rows);
  });

  it('trial $0 without breakdown composes zero amounts', () => {
    const rows = basePanelRows();
    rows.payment = {
      ...rows.payment,
      amountPaid: 0,
      subtotal: 0,
      taxTotal: 0,
      taxDetails: [],
      paymentMethod: 'trial',
      paymentMethodDetails: undefined,
    };
    expectPanelParity(rows);
  });

  it('blank plan snapshot name falls back to the generic plan name', () => {
    const rows = basePanelRows();
    rows.payment = { ...rows.payment, planSnapshotName: '   ' };
    expectPanelParity(rows);
  });

  it('bigint cents arriving as strings are normalized identically', () => {
    const rows = basePanelRows();
    rows.payment = {
      ...rows.payment,
      amountPaid: '11600',
      subtotal: '10000',
      taxTotal: '1600',
    };
    expectPanelParity(rows);
  });

  it('organization without legal identity composes null emitter fields', () => {
    const rows = basePanelRows();
    rows.organization = {
      ...rows.organization,
      legalName: null,
      taxId: null,
      address: null,
    };
    expectPanelParity(rows);
  });

  it('throws on both paths when taxes were never persisted', () => {
    const rows = basePanelRows();
    rows.payment = { ...rows.payment, subtotal: null, taxTotal: null };
    expect(() => composePanelReceipt(rows)).toThrow(/no persistidos/);
    expect(() =>
      legacyBuildReceiptDataFromComposed(legacyPanelRowsToInput(rows)),
    ).toThrow(/no persistidos/);
  });

  it('fails closed when the row carries no receipt number', () => {
    const rows = basePanelRows();
    rows.payment = { ...rows.payment, receiptNumber: null };
    expect(() => composePanelReceipt(rows)).toThrow(/sin número persistido/);
  });
});

/* ── Platform issuer (FitStack, SaaS) ──────────────────────────────────── */

describe('composePlatformReceipt (parity with the frozen legacy path)', () => {
  function expectPlatformParity(rows: PlatformReceiptComposedRows): void {
    expect(composePlatformReceipt(rows)).toEqual(
      legacyBuildPlatformReceiptDataFromComposed(legacyPlatformRowsToInput(rows)),
    );
  }

  it('happy path: FitStack emitter from settings, org receptor', () => {
    const rows = basePlatformRows();
    expectPlatformParity(rows);
    expect(composePlatformReceipt(rows).document.number).toBe('FS-0000042');
  });

  it('currency conversion: baseTotal from the persisted rate', () => {
    const rows = basePlatformRows();
    rows.payment = {
      ...rows.payment,
      amountPaid: 7300,
      subtotal: 7300,
      taxTotal: 0,
      taxDetails: [],
      currencyPaid: 'VES',
      exchangeRateApplied: '36.5',
    };
    expectPlatformParity(rows);
  });

  it('empty emitter settings compose the generic FitStack identity', () => {
    const rows = basePlatformRows();
    rows.emitter = {};
    expectPlatformParity(rows);
  });

  it('missing subscription falls back to the payment date period', () => {
    const rows = basePlatformRows();
    rows.subscription = null;
    expectPlatformParity(rows);
  });

  it('voided payment keeps the number and the voided flag', () => {
    const rows = basePlatformRows();
    rows.payment = { ...rows.payment, receiptVoided: true };
    expectPlatformParity(rows);
  });

  it('frozen emitter snapshot wins over the edited live receptor', () => {
    const rows = basePlatformRows();
    rows.payment = {
      ...rows.payment,
      emitterSnapshot: buildPlatformEmitterSnapshot(
        {
          receptor: rows.organization,
          emitter: platformEmitterFromSettings(rows.emitter),
          currency: rows.payment.planSnapshotCurrency,
        },
        resolveFiscalProfile(rows.organization.countryCode, undefined),
      ),
    };
    rows.organization = {
      ...rows.organization,
      legalName: 'Otro Gym C.A.',
      taxId: 'J-888',
      countryCode: 'CO',
      timezone: 'America/Bogota',
    };
    expectPlatformParity(rows);
  });

  it('trial $0 without breakdown composes zero amounts', () => {
    const rows = basePlatformRows();
    rows.payment = {
      ...rows.payment,
      amountPaid: 0,
      subtotal: 0,
      taxTotal: 0,
      taxDetails: [],
      paymentMethod: 'trial',
      paymentMethodDetails: undefined,
    };
    expectPlatformParity(rows);
  });

  it('bigint cents arriving as strings are normalized identically', () => {
    const rows = basePlatformRows();
    rows.payment = {
      ...rows.payment,
      amountPaid: '5000',
      subtotal: '4202',
      taxTotal: '798',
    };
    expectPlatformParity(rows);
  });

  it('receptor without legal identity composes the org name and null doc', () => {
    const rows = basePlatformRows();
    rows.organization = { ...rows.organization, legalName: null, taxId: null };
    expectPlatformParity(rows);
  });

  it('throws on both paths when taxes were never persisted', () => {
    const rows = basePlatformRows();
    rows.payment = { ...rows.payment, subtotal: null, taxTotal: null };
    expect(() => composePlatformReceipt(rows)).toThrow(/no persistidos/);
    expect(() =>
      legacyBuildPlatformReceiptDataFromComposed(legacyPlatformRowsToInput(rows)),
    ).toThrow(/no persistidos/);
  });

  it('fails closed when the row carries no receipt number', () => {
    const rows = basePlatformRows();
    rows.payment = { ...rows.payment, receiptNumber: null };
    expect(() => composePlatformReceipt(rows)).toThrow(/sin número persistido/);
  });
});

/* Note: the receiptIssuedAt-null state is deliberately NOT a fixture. It is
   unreachable in production: step 1 persists receipt_number and
   receipt_issued_at in the same statement, the jobs-worker render path
   throws before composing when it is missing, and the api-worker status
   read only composes when a deliverable PDF key exists. */
