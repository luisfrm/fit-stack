/**
 * Plantilla corta de email de comprobante: notificación + PDF adjunto
 * (el PDF es la fuente de verdad). El UUID técnico nunca es visible.
 */
import { describe, expect, it } from 'vitest';
import { renderPaymentReceiptShort } from '../src/templates/payment-receipt-short';

const base = {
  memberName: 'Juan Pérez',
  planName: 'Plan Mensual',
  amountPaid: '50,00 USD',
  paymentMethod: 'transferencia',
  paymentDate: '05 de septiembre de 2026',
  orgName: 'Gym Fit Stack',
};

describe('renderPaymentReceiptShort', () => {
  it('muestra el número correlativo en asunto y cuerpo, sin UUID', () => {
    const { subject, html } = renderPaymentReceiptShort({
      ...base,
      receiptNumber: 'fit-stack-2026-000045',
      hasAttachment: true,
    });
    expect(subject).toBe('Comprobante fit-stack-2026-000045 — Gym Fit Stack');
    expect(html).toContain('fit-stack-2026-000045');
    expect(subject).not.toContain('Operación #');
    expect(html).not.toContain('Operación #');
  });

  it('con adjunto aclara que el PDF es el documento válido', () => {
    const { html } = renderPaymentReceiptShort({
      ...base,
      receiptNumber: 'fit-stack-2026-000045',
      hasAttachment: true,
    });
    expect(html).toContain('Adjuntamos tu comprobante en PDF');
  });

  it('histórico (sin número): sin adjunto y con línea pre-sistema', () => {
    const { subject, html } = renderPaymentReceiptShort({
      ...base,
      receiptNumber: null,
      hasAttachment: false,
    });
    expect(subject).toBe('Comprobante de pago — Gym Fit Stack');
    expect(html).not.toContain('Operación #');
    expect(html).toContain('anterior al sistema de comprobantes correlativos');
  });

  it('escapa HTML en todos los campos interpolados', () => {
    const { subject, html } = renderPaymentReceiptShort({
      memberName: '<script>alert(1)</script>',
      planName: '<b>Plan</b>',
      amountPaid: '50,00 USD',
      paymentMethod: '<img src=x onerror=1>',
      paymentDate: '05 de septiembre de 2026',
      orgName: '<i>Gym</i>',
      receiptNumber: '<u>fit-1</u>',
      hasAttachment: true,
    });
    expect(html).not.toContain('<script>alert(1)</script>');
    expect(html).not.toContain('<b>Plan</b>');
    expect(html).not.toContain('<img src=x onerror=1>');
    expect(html).not.toContain('<i>Gym</i>');
    expect(html).not.toContain('<u>fit-1</u>');
    expect(html).toContain('&lt;script&gt;');
    expect(subject).toContain('<u>fit-1</u>');
  });
});
