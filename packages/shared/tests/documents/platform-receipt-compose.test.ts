/**
 * Compose del comprobante SaaS: emisor FitStack por keys, receptor org,
 * impuestos leídos (nunca recalculados), type 'receipt' por construcción.
 */
import { describe, expect, it } from 'vitest';
import {
  buildPlatformEmitterSnapshot,
  buildPlatformReceiptDataFromComposed,
  platformEmitterFromSettings,
  resolvePlatformEmitterProfile,
  type PlatformComposeReceiptInput,
} from '../../src/documents/receipt-compose';
import { resolveFiscalProfile } from '../../src/documents/fiscal-profile';
import type { ReceiptEmitterSnapshot } from '../../src/documents/receipt-data';

/**
 * Issuer snapshot of an input: RD-160 freezes the ISSUER's fiscal wording
 * (`fitstack_country_code`) while the recipient keeps its own profile.
 */
function snapshotFor(input: PlatformComposeReceiptInput): ReceiptEmitterSnapshot {
  return buildPlatformEmitterSnapshot(
    {
      receptor: input.receptor,
      emitter: input.emitter,
      currency: input.payment.planSnapshotCurrency,
    },
    resolvePlatformEmitterProfile(input.emitter),
    resolveFiscalProfile(input.receptor.countryCode, undefined),
  );
}

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
      address: 'Av. Libertador, Torre Demo, Caracas',
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

  it('emisor vacío → genérico FitStack (el país del receptor no decide la etiqueta)', () => {
    const input = baseInput();
    input.emitter = { legalName: '', taxId: '', address: '', countryCode: '' };
    const data = buildPlatformReceiptDataFromComposed(input);
    expect(data.emitter.name).toBe('FitStack');
    // Informational field only: the fiscal wording stays generic (RD-160).
    expect(data.emitter.countryCode).toBe('VE');
    expect(data.emitter.taxLabel).toBe('Tax ID');
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

  it('baseTotal usa el precio del plan congelado y cae a la división si falta', () => {
    const frozen = baseInput();
    frozen.payment.currencyPaid = 'VES';
    frozen.payment.exchangeRateApplied = '36.5';
    frozen.payment.amountPaid = 7300;
    frozen.payment.planSnapshotPrice = 5000;
    expect(buildPlatformReceiptDataFromComposed(frozen).amounts.baseTotal).toBe(5000);

    // Row without the frozen plan price (pre-snapshot): documented division
    // fallback, 7300 / 36.5 = 200.
    const legacy = baseInput();
    legacy.payment.currencyPaid = 'VES';
    legacy.payment.exchangeRateApplied = '36.5';
    legacy.payment.amountPaid = 7300;
    legacy.payment.planSnapshotPrice = null;
    expect(buildPlatformReceiptDataFromComposed(legacy).amounts.baseTotal).toBe(200);
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

  /* ── Receptor B2B (RD-150): etiqueta fiscal y dirección ── */

  it('receptor organización marca B2B y usa el taxLabel del país (R.I.F. en VE)', () => {
    const data = buildPlatformReceiptDataFromComposed(baseInput());
    expect(data.recipient.kind).toBe('organization');
    expect(data.recipient.docLabel).toBe('R.I.F.');
    expect(data.recipient.docLabel).not.toBe('C.I.');
    expect(data.recipient.address).toBe('Av. Libertador, Torre Demo, Caracas');
  });

  it('receptor en CO usa NIT y sin dirección compone null (la línea se omite)', () => {
    const input = baseInput();
    input.receptor = {
      ...input.receptor,
      countryCode: 'CO',
      timezone: 'America/Bogota',
      address: null,
    };
    const data = buildPlatformReceiptDataFromComposed(input);
    expect(data.recipient.kind).toBe('organization');
    expect(data.recipient.docLabel).toBe('NIT');
    expect(data.recipient.address).toBeNull();
  });

  /* ── Etiqueta y disclaimer del emisor (RD-160) ── */

  const GENERIC_DISCLAIMER = [
    'Comprobante de pago interno. No constituye una factura fiscal.',
    'Emitido por FitStack',
  ];

  it('emisor VE hacia receptor CO: la etiqueta y el disclaimer siguen al emisor', () => {
    const input = baseInput();
    input.receptor = {
      ...input.receptor,
      countryCode: 'CO',
      timezone: 'America/Bogota',
    };
    // The receiver's country must never drive the issuer's fiscal wording.
    input.emitter = {
      legalName: 'FitStack C.A.',
      taxId: 'J-123',
      address: 'Av. Principal',
      countryCode: 'VE',
    };
    const data = buildPlatformReceiptDataFromComposed(input);

    expect(data.emitter.taxLabel).toBe('R.I.F.');
    expect(data.footer.disclaimer.join(' ')).toContain('SENIAT');
    expect(data.footer.disclaimer.join(' ')).not.toContain('DIAN');
    // The recipient keeps the label of ITS country.
    expect(data.recipient.docLabel).toBe('NIT');
  });

  it('emisor CO hacia receptor VE: NIT para el emisor y disclaimer de CO', () => {
    const input = baseInput();
    input.emitter = {
      legalName: 'FitStack Colombia S.A.S.',
      taxId: 'NIT-999',
      address: 'Bogotá',
      countryCode: 'CO',
    };
    const data = buildPlatformReceiptDataFromComposed(input);

    expect(data.emitter.taxLabel).toBe('NIT');
    expect(data.footer.disclaimer.join(' ')).toContain('DIAN');
    expect(data.footer.disclaimer.join(' ')).not.toContain('SENIAT');
    expect(data.recipient.docLabel).toBe('R.I.F.');
  });

  it('emisor sin país y con taxId: Tax ID genérico y disclaimer no fiscal', () => {
    const input = baseInput();
    input.receptor = {
      ...input.receptor,
      countryCode: 'CO',
      timezone: 'America/Bogota',
    };
    input.emitter = { ...input.emitter, countryCode: '' };
    const data = buildPlatformReceiptDataFromComposed(input);

    // Never the recipient's NIT: no configured issuer country = generic.
    expect(data.emitter.taxLabel).toBe('Tax ID');
    expect(data.emitter.taxId).toBe('J-123');
    expect(data.footer.disclaimer).toEqual(GENERIC_DISCLAIMER);
    expect(data.footer.disclaimer.join(' ')).not.toMatch(/SENIAT|DIAN/);
    expect(data.recipient.docLabel).toBe('NIT');
  });

  it('emisor sin país y sin taxId: sin línea fiscal y disclaimer genérico', () => {
    const input = baseInput();
    input.emitter = { legalName: '', taxId: '', address: '', countryCode: '' };
    const data = buildPlatformReceiptDataFromComposed(input);

    // No `taxId` → the PDF omits the fiscal line (never invented).
    expect(data.emitter.taxId).toBeNull();
    expect(data.emitter.taxLabel).toBe('Tax ID');
    expect(data.footer.disclaimer).toEqual(GENERIC_DISCLAIMER);
    expect(data.document.label).toBe('Comprobante de pago');
    // The recipient keeps its own label.
    expect(data.recipient.docLabel).toBe('R.I.F.');
  });

  it('snapshot congelado: cambiar el país del emisor después de emitir no cambia nada', () => {
    const issued = baseInput();
    issued.emitterSnapshot = snapshotFor(issued);
    const asIssued = buildPlatformReceiptDataFromComposed(issued);
    expect(asIssued.emitter.taxLabel).toBe('R.I.F.');

    const later: PlatformComposeReceiptInput = {
      ...issued,
      emitter: { ...issued.emitter, countryCode: 'CO' },
    };
    const recomposed = buildPlatformReceiptDataFromComposed(later);
    expect(recomposed.emitter.taxLabel).toBe('R.I.F.');
    expect(recomposed.footer.disclaimer).toEqual(asIssued.footer.disclaimer);
    expect(recomposed.footer.disclaimer.join(' ')).toContain('SENIAT');
  });

  it('snapshot previo con docLabel se respeta tal cual (estado terminal, C1)', () => {
    const input = baseInput();
    // Snapshot emitted BEFORE RD-150: it froze the person-natural label.
    input.emitterSnapshot = {
      ...snapshotFor(input),
      recipientDocLabel: 'C.I.',
    };
    const data = buildPlatformReceiptDataFromComposed(input);
    // The frozen label is NOT rewritten (reproducibility)…
    expect(data.recipient.docLabel).toBe('C.I.');
    // …but the structural marker still removes "Socio / Cliente" wording.
    expect(data.recipient.kind).toBe('organization');
  });

  /* ── Snapshot del emisor ── */

  it('con snapshot: editar el emisor DESPUÉS no cambia el comprobante', () => {
    const issued = baseInput();
    issued.emitterSnapshot = snapshotFor(issued);
    const asIssued = buildPlatformReceiptDataFromComposed(issued);

    const later: PlatformComposeReceiptInput = {
      ...issued,
      receptor: { ...issued.receptor, countryCode: 'CO', timezone: 'America/Bogota' },
      emitter: {
        legalName: 'FitStack Colombia S.A.S.',
        taxId: 'NIT-999',
        address: 'Bogotá',
        countryCode: 'CO',
      },
    };
    const recomposed = buildPlatformReceiptDataFromComposed(later);

    expect(recomposed.emitter).toEqual(asIssued.emitter);
    expect(recomposed.footer.disclaimer).toEqual(asIssued.footer.disclaimer);
    expect(recomposed.document.label).toBe(asIssued.document.label);
    expect(recomposed.timezone).toBe(asIssued.timezone);
  });

  it('congela el emisor genérico cuando las keys están vacías', () => {
    const input = baseInput();
    input.emitter = platformEmitterFromSettings({});
    const snapshot = snapshotFor(input);
    expect(snapshot.emitter.name).toBe('FitStack');
    expect(snapshot.emitter.countryCode).toBe('VE');
    expect(snapshot.emitter.taxLabel).toBe('Tax ID');
    expect(snapshot.disclaimer).toContain('Emitido por FitStack');
    // FitStack no es contribuyente formal: todos los impuestos congelados off.
    expect(snapshot.taxes).toEqual([
      { name: 'IVA', rate: 0.16, enabled: false },
      { name: 'IGTF', rate: 0.03, enabled: false },
    ]);
  });

  it('con snapshot no se lee el país del receptor (config viva irrelevante)', () => {
    const input = baseInput();
    input.emitterSnapshot = snapshotFor(input);
    // País del receptor corrupto/desconocido: el emitido sigue componiendo.
    input.receptor = { ...input.receptor, countryCode: 'XX' };
    expect(buildPlatformReceiptDataFromComposed(input).emitter.countryCode).toBe('VE');
  });

  it('snapshot inválido lanza (nunca degrada a la config viva)', () => {
    const input = baseInput();
    input.emitterSnapshot = { version: 2, emitter: {} };
    expect(() => buildPlatformReceiptDataFromComposed(input)).toThrow(
      /emitter_snapshot inválido/,
    );
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

    // Unknown ISSUER country is a visible configuration error too (RD-160).
    const badEmitterCountry = baseInput();
    badEmitterCountry.emitter = { ...badEmitterCountry.emitter, countryCode: 'XX' };
    expect(() => buildPlatformReceiptDataFromComposed(badEmitterCountry)).toThrow(
      /desconocido/,
    );

    const badDate = baseInput();
    badDate.issuedAt = new Date(NaN);
    expect(() => buildPlatformReceiptDataFromComposed(badDate)).toThrow(/inválida/);
  });
});
