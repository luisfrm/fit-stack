/**
 * Builder puro de ReceiptData: fiscal sobre lo persistido, masking,
 * snapshots congelados. Sin recalcular impuestos.
 */
import { describe, expect, it } from 'vitest';
import {
  buildEmitterSnapshot,
  buildReceiptDataFromComposed,
  toReceiptMaskedDetails,
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

  it('free $0 sin desglose: amounts en cero', () => {
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

  /**
   * RD-159: the void writes `status = 'voided'` first and `receipt_voided`
   * second. A lost second write must still compose a VOIDED document: the PDF
   * renderer reads this flag to stamp it, and a stamped-less artifact would be
   * persisted under the `-anulado.pdf` key forever.
   */
  it('status voided con receiptVoided=false compone voided: true (RD-159)', () => {
    const input = validInput();
    input.payment.status = 'voided';
    input.payment.receiptVoided = false;
    expect(buildReceiptDataFromComposed(input).voided).toBe(true);
  });

  it('receiptVoided=true sigue componiendo voided: true', () => {
    const input = validInput();
    input.payment.status = 'validated';
    input.payment.receiptVoided = true;
    expect(buildReceiptDataFromComposed(input).voided).toBe(true);
  });

  it('baseTotal = null cuando el pago ya está en la moneda base', () => {
    const input = validInput();
    input.payment.currencyPaid = 'VES';
    input.payment.planSnapshotCurrency = 'VES';
    input.payment.exchangeRateApplied = '36.5';
    input.payment.planSnapshotPrice = 10000;
    expect(buildReceiptDataFromComposed(input).amounts.baseTotal).toBeNull();
  });

  it('baseTotal usa el precio del plan persistido, sin dividir la tasa', () => {
    const input = validInput();
    // A COP plan paid in USD: a 4-decimal rate would round 0.00025 to 0.0003
    // and the division would inflate the base total by ~20%.
    input.payment.amountPaid = 10;
    input.payment.currencyPaid = 'USD';
    input.payment.planSnapshotCurrency = 'COP';
    input.payment.exchangeRateApplied = '0.0003';
    input.payment.planSnapshotPrice = 40000;
    const data = buildReceiptDataFromComposed(input);
    expect(data.amounts.baseCurrency).toBe('COP');
    expect(data.amounts.baseTotal).toBe(40000);
  });

  it('baseTotal histórico convierte con la tasa persistida (redondeo al centavo)', () => {
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

  /* ── Snapshot del emisor ── */

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
    // Perfil del país completo: declararse contribuyente formal habilita el
    // perfil (el condicional se evalúa al calcular, ver `tax_details`).
    // El snapshot guarda solo nombre/tasa/estado (shape persistido v1).
    expect(snapshot.taxes).toEqual([
      { name: 'IVA', rate: 0.16, enabled: true },
      { name: 'IGTF', rate: 0.03, enabled: true },
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

  it('passes checklistPrePdf with production payment 4 data (R2 file path excluded from receipt)', () => {
    const input = validInput();
    input.payment.id = 4;
    input.payment.paymentMethod = 'Binance';
    input.payment.planSnapshotName = 'Standard';
    input.payment.paymentMethodDetails = [
      {
        type: 'text',
        label: 'Correo/Binance Id/Usuario remitente',
        value: 'luisfrm_@outlook.com',
      },
      {
        type: 'file',
        label: 'Recibo',
        value:
          'cdab3d7b-b519-4f2d-bff1-e49c4af5ff8b/receipts/luis-rivas_binance_573810_9b775753.png',
      },
    ];
    const data = buildReceiptDataFromComposed(input);
    expect(data.method.name).toBe('Binance');
    // Only the non-file field is included in maskedDetails; file path is omitted from receipt
    expect(data.method.maskedDetails).toEqual([
      {
        label: 'Correo/Binance Id/Usuario remitente',
        value: 'luis••••••••••••••om',
      },
    ]);
    expect(checklistPrePdf(data)).toEqual({ ok: true, errors: [] });
  });
});

describe('toReceiptMaskedDetails', () => {
  it('excludes items with type file (storage attachments)', () => {
    const input = [
      { type: 'text', label: 'Referencia', value: '1234••••••12' },
      {
        type: 'file',
        label: 'Recibo',
        value: 'cdab3d7b-b519-4f2d-bff1-e49c4af5ff8b/receipts/doc.png',
      },
    ];
    expect(toReceiptMaskedDetails(input)).toEqual([
      { label: 'Referencia', value: '1234••••••12' },
    ]);
  });

  it('returns undefined if all items are file attachments', () => {
    const input = [
      {
        type: 'file',
        label: 'Recibo',
        value: 'cdab3d7b-b519-4f2d-bff1-e49c4af5ff8b/receipts/doc.png',
      },
    ];
    expect(toReceiptMaskedDetails(input)).toBeUndefined();
  });

  it('preserves legacy items without type', () => {
    const input = [{ label: 'Nota', value: 'Pago verificado' }];
    expect(toReceiptMaskedDetails(input)).toEqual([
      { label: 'Nota', value: 'Pago verificado' },
    ]);
  });
});
