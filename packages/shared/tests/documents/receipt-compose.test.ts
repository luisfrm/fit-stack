/**
 * Builder puro de ReceiptData: fiscal sobre lo persistido, masking,
 * snapshots congelados. Sin recalcular impuestos.
 */
import { describe, expect, it } from 'vitest';
import {
  buildEmitterSnapshot,
  buildReceiptDataFromComposed,
  type ComposeReceiptInput,
} from '../../src/documents/receipt-compose';
import { checklistPrePdf } from '../../src/documents/receipt-data';
import { resolveFiscalProfile } from '../../src/documents/fiscal-profile';

function validInput(): ComposeReceiptInput {
  return {
    receiptNumber: 'fit-stack-2026-000045',
    documentType: 'receipt',
    issuedAt: '2026-09-11T10:00:00.000Z',
    payment: {
      id: 42,
      amountPaid: 11600,
      currencyPaid: 'VES',
      exchangeRateApplied: null,
      paymentMethod: 'Transferencia',
      paymentMethodDetails: [{ label: 'Referencia', value: '123456789012', type: 'text' }],
      paymentDate: '2026-09-11T09:00:00.000Z',
      subtotal: 10000,
      taxTotal: 1600,
      taxDetails: [{ name: 'IVA', rate: 0.16, amount: 1600 }],
      receiptNumber: 'fit-stack-2026-000045',
      planSnapshotName: 'Plan Mensual',
    },
    organization: {
      name: 'Gym Fit Stack',
      legalName: 'Fit Stack C.A.',
      taxId: 'J-12345678-9',
      address: 'Caracas',
      countryCode: 'VE',
      primaryCurrency: 'VES',
    },
    member: { firstName: 'Juan', lastName: 'Pérez', documentId: 'V-12345678' },
    subscription: { startDate: '2026-09-01', endDate: '2026-09-30' },
  };
}

describe('buildReceiptDataFromComposed', () => {
  it('arma el contrato completo y pasa el checklist', () => {
    const data = buildReceiptDataFromComposed(validInput());
    expect(data.document.number).toBe('fit-stack-2026-000045');
    expect(data.document.label).toBe('Comprobante de pago');
    expect(data.amounts.total).toBe(11600);
    expect(data.sale.planName).toBe('Plan Mensual');
    expect(data.method.maskedDetails).toEqual([
      { label: 'Referencia', value: '1234••••••12' },
    ]);
    expect(data.internalPaymentId).toBe(42);
    expect(checklistPrePdf(data)).toEqual({ ok: true, errors: [] });
  });

  it('sin impuestos persistidos lanza (no inventa)', () => {
    const input = validInput();
    input.payment.subtotal = null;
    expect(() => buildReceiptDataFromComposed(input)).toThrow(/no persistidos/);
  });

  it('trial $0 sin desglose: amounts en cero', () => {
    const input = validInput();
    input.payment.amountPaid = 0;
    input.payment.subtotal = 0;
    input.payment.taxTotal = 0;
    input.payment.taxDetails = [];
    const data = buildReceiptDataFromComposed(input);
    expect(data.amounts.total).toBe(0);
    expect(checklistPrePdf(data).ok).toBe(true);
  });

  it('miembro ausente no rompe (mostrador)', () => {
    const input = validInput();
    input.member = null;
    expect(buildReceiptDataFromComposed(input).recipient.name).toBe('Miembro');
  });

  it('baseTotal = null cuando el pago ya está en la moneda base', () => {
    const input = validInput();
    input.payment.currencyPaid = 'VES';
    input.payment.planSnapshotCurrency = 'VES';
    input.payment.exchangeRateApplied = '36.5';
    expect(buildReceiptDataFromComposed(input).amounts.baseTotal).toBeNull();
  });

  it('baseTotal convierte con la tasa persistida (redondeo al centavo)', () => {
    const input = validInput();
    input.payment.amountPaid = 7300;
    input.payment.currencyPaid = 'VES';
    input.payment.planSnapshotCurrency = 'USD';
    input.payment.exchangeRateApplied = '36.5';
    const data = buildReceiptDataFromComposed(input);
    expect(data.amounts.baseCurrency).toBe('USD');
    expect(data.amounts.baseTotal).toBe(200);
  });

  it('sin tasa persistida no inventa equivalente (baseTotal null)', () => {
    const input = validInput();
    input.payment.currencyPaid = 'VES';
    input.payment.planSnapshotCurrency = 'USD';
    input.payment.exchangeRateApplied = null;
    expect(buildReceiptDataFromComposed(input).amounts.baseTotal).toBeNull();
  });

  /* ── Snapshot del emisor (C1) ── */

  it('con snapshot: el perfil editado DESPUÉS no cambia el comprobante', () => {
    const issued = validInput();
    issued.emitterSnapshot = buildEmitterSnapshot(
      issued.organization,
      resolveFiscalProfile(issued.organization.countryCode, undefined),
    );
    const asIssued = buildReceiptDataFromComposed(issued);

    // Meses después: el gym cambia nombre legal, RIF, dirección y se declara
    // contribuyente formal (con desglose). El comprobante ya emitido no cambia.
    const live: ComposeReceiptInput = {
      ...issued,
      organization: {
        ...issued.organization,
        legalName: 'Otro Nombre C.A.',
        taxId: 'J-99999999-9',
        address: 'Otra dirección',
        countryCode: 'CO',
        fiscalConfig: { isFormalTaxpayer: true },
      },
    };
    const recomposed = buildReceiptDataFromComposed(live);

    expect(recomposed.emitter).toEqual(asIssued.emitter);
    expect(recomposed.footer.disclaimer).toEqual(asIssued.footer.disclaimer);
    expect(recomposed.document.label).toBe(asIssued.document.label);
    expect(recomposed.recipient.docLabel).toBe(asIssued.recipient.docLabel);
    expect(recomposed.timezone).toBe(asIssued.timezone);
  });

  it('con snapshot no se lee la config viva (país desconocido no rompe)', () => {
    const input = validInput();
    input.emitterSnapshot = buildEmitterSnapshot(
      input.organization,
      resolveFiscalProfile('VE', { isFormalTaxpayer: true }),
    );
    input.organization.countryCode = 'XX';
    const data = buildReceiptDataFromComposed(input);
    expect(data.emitter.countryCode).toBe('VE');
    expect(data.emitter.taxLabel).toBe('R.I.F.');
  });

  it('el snapshot congela el perfil fiscal con el que se calculó', () => {
    const input = validInput();
    const profile = resolveFiscalProfile('VE', { isFormalTaxpayer: true });
    const snapshot = buildEmitterSnapshot(input.organization, profile);
    expect(snapshot.version).toBe(1);
    // Perfil del país completo, con el condicional apagado (D2).
    expect(snapshot.taxes).toEqual([
      { name: 'IVA', rate: 0.16, enabled: true },
      { name: 'IGTF', rate: 0.03, enabled: false },
    ]);
    expect(snapshot.documentLabel).toBe('Comprobante de pago');
    input.emitterSnapshot = snapshot;
    expect(buildReceiptDataFromComposed(input).document.label).toBe(
      'Comprobante de pago',
    );
  });

  it('sin snapshot (legacy) compone en vivo con la config actual', () => {
    const input = validInput();
    input.organization.legalName = 'Nombre de hoy';
    expect(buildReceiptDataFromComposed(input).emitter.legalName).toBe('Nombre de hoy');
  });

  it('snapshot inválido lanza (nunca degrada a la config viva)', () => {
    const input = validInput();
    input.emitterSnapshot = { version: 1, emitter: { name: 'X' } };
    expect(() => buildReceiptDataFromComposed(input)).toThrow(/emitter_snapshot inválido/);
  });
});
