/**
 * Compose del comprobante SaaS (C2): emisor FitStack por keys, receptor org,
 * impuestos leídos (nunca recalculados), type 'receipt' por construcción.
 */
import { describe, expect, it } from 'vitest';
import {
  buildPlatformReceiptDataFromComposed,
  type PlatformComposeReceiptInput,
} from '../../src/documents/receipt-compose';

function baseInput(): PlatformComposeReceiptInput {
  return {
    receiptNumber: 'FS-0000042',
    issuedAt: new Date('2026-09-15T12:00:00.000Z'),
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
      planSnapshotName: 'Plan SaaS',
      planSnapshotCurrency: 'USD',
      voided: false,
    },
    subscription: {
      startDate: new Date('2026-09-14T00:00:00.000Z'),
      currentPeriodEnd: new Date('2026-10-14T00:00:00.000Z'),
    },
    receptor: {
      name: 'Gym Demo',
      legalName: 'Gimnasio Demo C.A.',
      taxId: 'J-999',
      countryCode: 'VE',
      timezone: 'America/Caracas',
    },
    emitter: {
      legalName: 'FitStack C.A.',
      taxId: 'J-123',
      address: 'Av. Principal',
      countryCode: 'VE',
    },
  };
}

describe('buildPlatformReceiptDataFromComposed', () => {
  it('mapea emisor FitStack por keys y receptor org', () => {
    const data = buildPlatformReceiptDataFromComposed(baseInput());
    expect(data.emitter.name).toBe('FitStack C.A.');
    expect(data.emitter.taxId).toBe('J-123');
    expect(data.emitter.countryCode).toBe('VE');
    expect(data.emitter.currency).toBe('USD');
    expect(data.recipient.name).toBe('Gimnasio Demo C.A.');
    expect(data.recipient.documentId).toBe('J-999');
    expect(data.document.number).toBe('FS-0000042');
    expect(data.document.type).toBe('receipt');
    expect(data.document.label).toBe('Comprobante de pago');
    expect(data.internalPaymentId).toBe(7);
  });

  it('emisor vacío → genérico FitStack con país proxy del receptor', () => {
    const input = baseInput();
    input.emitter = { legalName: '', taxId: '', address: '', countryCode: '' };
    const data = buildPlatformReceiptDataFromComposed(input);
    expect(data.emitter.name).toBe('FitStack');
    expect(data.emitter.countryCode).toBe('VE');
    expect(data.document.label).toBe('Comprobante de pago');
  });

  it('pie = disclaimer del país + Emitido por FitStack, sin duplicar', () => {
    const data = buildPlatformReceiptDataFromComposed(baseInput());
    expect(data.footer.disclaimer).toContain('Emitido por FitStack');
    expect(data.footer.generatedBy).toBe('Generado con FitStack');
    expect(
      data.footer.disclaimer.filter((d) => d === 'Emitido por FitStack'),
    ).toHaveLength(1);
  });

  it('enmascara detalles y conserva periodo acumulativo', () => {
    const data = buildPlatformReceiptDataFromComposed(baseInput());
    expect(data.method.maskedDetails).toBeDefined();
    expect(JSON.stringify(data.method.maskedDetails)).not.toContain('ABC123456');
    expect(data.sale.periodStart).toBe('2026-09-14T00:00:00.000Z');
    expect(data.sale.periodEnd).toBe('2026-10-14T00:00:00.000Z');
    expect(data.sale.planName).toBe('Plan SaaS');
    expect(data.amounts).toMatchObject({
      subtotal: 4202,
      taxTotal: 798,
      total: 5000,
      currencyPaid: 'USD',
      baseCurrency: 'USD',
    });
  });

  it('baseTotal: null en la moneda base del plan, convertido si difiere', () => {
    expect(
      buildPlatformReceiptDataFromComposed(baseInput()).amounts.baseTotal,
    ).toBeNull();

    const conversion = baseInput();
    conversion.payment.currencyPaid = 'VES';
    conversion.payment.exchangeRateApplied = '36.5';
    conversion.payment.amountPaid = 7300;
    expect(
      buildPlatformReceiptDataFromComposed(conversion).amounts.baseTotal,
    ).toBe(200);
  });

  it('trial $0 sin desglose compone (SKIP lo deja sin número, no el compose)', () => {
    const input = baseInput();
    input.payment = {
      ...input.payment,
      amountPaid: 0,
      subtotal: 0,
      taxTotal: 0,
      taxDetails: [],
      paymentMethod: 'trial',
    };
    const data = buildPlatformReceiptDataFromComposed(input);
    expect(data.amounts.total).toBe(0);
    expect(data.amounts.taxDetails).toEqual([]);
  });

  it('sin subscription cae a paymentDate (determinista) y voided pasa', () => {
    const input = baseInput();
    input.subscription = null;
    input.payment = { ...input.payment, voided: true };
    const data = buildPlatformReceiptDataFromComposed(input);
    expect(data.sale.periodStart).toBe('2026-09-14T10:00:00.000Z');
    expect(data.sale.periodEnd).toBe('2026-09-14T10:00:00.000Z');
    expect(data.voided).toBe(true);
  });

  it('lanza sin impuestos persistidos, país desconocido o fecha inválida', () => {
    const noTaxes = baseInput();
    noTaxes.payment = { ...noTaxes.payment, subtotal: null, taxTotal: null };
    expect(() => buildPlatformReceiptDataFromComposed(noTaxes)).toThrow(
      /impuestos no persistidos/,
    );

    const badCountry = baseInput();
    badCountry.receptor = { ...badCountry.receptor, countryCode: 'XX' };
    expect(() => buildPlatformReceiptDataFromComposed(badCountry)).toThrow(/desconocido/);

    const badDate = baseInput();
    badDate.issuedAt = new Date(NaN);
    expect(() => buildPlatformReceiptDataFromComposed(badDate)).toThrow(/inválida/);
  });
});
