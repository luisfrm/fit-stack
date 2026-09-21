/**
 * Receipt PDF render test (pure: data in → bytes out, no DB).
 *
 * Lives in jobs-worker because pdf-lib only resolves here (workerd-safe, no
 * WASM). Asserts the document is a valid PDF **and** the texto realmente
 * impreso: los campos opcionales ausentes se omiten (FACTURATION.md §3) y la
 * conversión a moneda base usa la tasa persistida.
 */
import { inflateSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import type { ReceiptData } from '@workspace/shared';
import { renderReceiptPdfBytes } from '../src/receipt-pdf';

/**
 * Texto pintado de un PDF, en orden de pintado y sin separadores: infla los
 * content streams (FlateDecode) y decodifica el run hex de cada operador
 * `Tj` (pdf-lib emite el texto como `<hex> Tj`, una línea por `Tj`, con bytes
 * WinAnsi — por eso se decodifica en latin1).
 */
function extractPdfText(bytes: Uint8Array): string {
  const raw = Buffer.from(bytes).toString('latin1');
  const runs: string[] = [];
  for (const stream of raw.matchAll(/stream\r?\n([\s\S]*?)\r?\nendstream/g)) {
    let content: string;
    try {
      content = inflateSync(Buffer.from(stream[1], 'latin1')).toString('latin1');
    } catch {
      continue; // stream sin comprimir (no lleva texto)
    }
    for (const operator of content.matchAll(/<([0-9a-fA-F]+)>\s*Tj/g)) {
      runs.push(Buffer.from(operator[1], 'hex').toString('latin1'));
    }
  }
  return runs.join('');
}

function sampleReceipt(): ReceiptData {
  return {
    emitter: {
      name: 'Gym Fit Stack',
      legalName: 'Fit Stack C.A.',
      taxId: 'J-12345678-9',
      taxLabel: 'R.I.F.',
      address: 'Caracas',
      countryCode: 'VE',
      currency: 'VES',
    },
    recipient: { name: 'Juan Pérez', documentId: 'V-12345678', docLabel: 'C.I.' },
    document: {
      number: 'fit-stack-2026-000045',
      type: 'receipt',
      label: 'Comprobante de pago',
      issuedAt: '2026-09-11T10:00:00.000Z',
    },
    sale: {
      planName: 'Plan Mensual',
      periodStart: '2026-09-01',
      periodEnd: '2026-09-30',
      paymentDate: '2026-09-11T09:00:00.000Z',
    },
    amounts: {
      subtotal: 10000,
      taxDetails: [{ name: 'IVA', rate: 0.16, amount: 1600 }],
      taxTotal: 1600,
      total: 11600,
      currencyPaid: 'VES',
      exchangeRateApplied: null,
    },
    method: {
      name: 'Transferencia',
      maskedDetails: [{ label: 'Referencia', value: '1234••••••12' }],
    },
    footer: {
      disclaimer: ['Este comprobante no constituye una factura fiscal.'],
      generatedBy: 'Generado con FitStack',
    },
    internalPaymentId: 42,
  };
}

describe('renderReceiptPdfBytes', () => {
  it('returns non-empty PDF bytes with %PDF header', async () => {
    const bytes = await renderReceiptPdfBytes(sampleReceipt(), 'latam');
    expect(bytes).toBeInstanceOf(Uint8Array);
    expect(bytes.length).toBeGreaterThan(1000);
    const header = Buffer.from(bytes.slice(0, 5)).toString('latin1');
    expect(header).toBe('%PDF-');
  }, 60000);

  it('imprime los datos del emisor y del receptor cuando existen', async () => {
    const text = extractPdfText(await renderReceiptPdfBytes(sampleReceipt(), 'latam'));
    // Los rótulos salen en mayúsculas por estilo (toUpperCase al dibujar).
    expect(text).toContain('R.I.F.: J-12345678-9');
    expect(text).toContain('DIRECCIÓN / SEDECaracas');
    expect(text).toContain('C.I. DEL SOCIOV-12345678');
  }, 60000);

  it('omite identificación fiscal, dirección y documento ausentes (sin "---")', async () => {
    const data = sampleReceipt();
    data.emitter.taxId = null;
    data.emitter.address = null;
    data.recipient.documentId = null;

    const text = extractPdfText(await renderReceiptPdfBytes(data, 'latam'));
    expect(text).not.toContain('R.I.F.');
    expect(text).not.toContain('C.I.');
    expect(text).not.toContain('---');
    expect(text).toContain('Juan Pérez');
  }, 60000);

  it('estampa ANULADO cuando el comprobante está anulado', async () => {
    const data = sampleReceipt();
    data.voided = true;

    const text = extractPdfText(await renderReceiptPdfBytes(data, 'latam'));
    // El sello viaja en los BYTES del documento: el PDF descargable de un
    // comprobante anulado no puede leerse como un comprobante vigente.
    expect(text.toUpperCase()).toContain('ANULADO');
    // Y sigue siendo el mismo comprobante (número + emisor intactos; el
    // emisor sale en mayúsculas por estilo del documento).
    expect(text).toContain('fit-stack-2026-000045');
    expect(text).toContain('FIT STACK C.A.');
  }, 60000);

  it('no estampa ANULADO en un comprobante vigente', async () => {
    const text = extractPdfText(await renderReceiptPdfBytes(sampleReceipt(), 'latam'));
    expect(text.toUpperCase()).not.toContain('ANULADO');
  }, 60000);

  it('muestra la conversión a moneda base cuando el pago difiere', async () => {
    const data = sampleReceipt();
    data.amounts.currencyPaid = 'USD';
    data.amounts.baseCurrency = 'VES';
    data.amounts.exchangeRateApplied = '36.5';
    data.amounts.baseTotal = 318;

    const text = extractPdfText(await renderReceiptPdfBytes(data, 'latam'));
    expect(text).toContain('Tasa aplicada: 1 VES = 36.5 USD');
    expect(text).toContain('Equivalente: 3,18 VES');
  }, 60000);

  it('omite la conversión cuando el pago difiere pero no hay tasa persistida', async () => {
    const data = sampleReceipt();
    data.amounts.currencyPaid = 'USD';
    data.amounts.baseCurrency = 'VES';
    data.amounts.exchangeRateApplied = null;
    data.amounts.baseTotal = 318;

    const text = extractPdfText(await renderReceiptPdfBytes(data, 'latam'));
    // Fail-closed (FACTURATION.md §3): sin tasa no se muestra conversión,
    // aunque `baseTotal` venga informado.
    expect(text).not.toContain('Tasa aplicada');
    expect(text).not.toContain('Equivalente');
  }, 60000);

  it('muestra la tasa sin equivalente cuando baseTotal es null', async () => {
    const data = sampleReceipt();
    data.amounts.currencyPaid = 'USD';
    data.amounts.baseCurrency = 'VES';
    data.amounts.exchangeRateApplied = '36.5';
    data.amounts.baseTotal = null;

    const text = extractPdfText(await renderReceiptPdfBytes(data, 'latam'));
    expect(text).toContain('Tasa aplicada: 1 VES = 36.5 USD');
    expect(text).not.toContain('Equivalente');
  }, 60000);

  it('sanitiza caracteres fuera de WinAnsi (emojis) sin romper el render', async () => {
    const data = sampleReceipt();
    data.recipient.name = 'Juan Pérez 🚀💪';
    data.sale.planName = 'Plan Mensual 🏋️';

    const bytes = await renderReceiptPdfBytes(data, 'latam');
    expect(bytes.length).toBeGreaterThan(1000);
    const text = extractPdfText(bytes);
    expect(text).toContain('Juan Pérez');
    expect(text).toContain('PLAN MENSUAL');
    expect(text).not.toContain('🚀');
  }, 60000);

  it('trunca tokens irrompibles largos y envuelve el disclaimer sin perder contenido', async () => {
    const data = sampleReceipt();
    const longToken = `REF-${'A'.repeat(300)}`;
    data.method.maskedDetails = [{ label: 'Referencia', value: longToken }];
    data.footer.disclaimer = [`Aviso legal largo: ${'palabra '.repeat(40)}fin del aviso.`];

    const bytes = await renderReceiptPdfBytes(data, 'latam');
    expect(bytes.length).toBeGreaterThan(1000);
    const text = extractPdfText(bytes);
    // El token completo no cabe: se trunca con elipsis (página única intacta).
    expect(text).not.toContain(longToken);
    // El disclaimer con wrap no pierde contenido (inicio y cierre presentes).
    expect(text).toContain('Aviso legal largo:');
    expect(text).toContain('fin del aviso.');
    // El documento sigue siendo el mismo comprobante.
    expect(text).toContain('fit-stack-2026-000045');
  }, 60000);
});
