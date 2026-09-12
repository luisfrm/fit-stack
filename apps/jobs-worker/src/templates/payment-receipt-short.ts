import { escapeHtml, renderLightShell, type RenderedEmail } from './layout';

export interface PaymentReceiptShortData {
  /** Número correlativo humano (nunca `payment.id`). Ausente = histórico pre-sistema. */
  receiptNumber?: string | null;
  memberName: string;
  planName: string;
  /** Ya formateado, p. ej. "50,00 USD". */
  amountPaid: string;
  paymentMethod: string;
  /** Ya formateado, p. ej. "05 de septiembre de 2026". */
  paymentDate: string;
  orgName: string;
  /** `true` cuando el PDF va adjunto (el PDF es la fuente de verdad). */
  hasAttachment: boolean;
}

/**
 * Notificación corta de comprobante: el cuerpo resume la operación y el
 * PDF adjunto es la fuente de verdad (nunca se regenera aquí).
 * El UUID técnico (`payment.id`) NUNCA aparece: solo el número correlativo.
 */
export function renderPaymentReceiptShort(data: PaymentReceiptShortData): RenderedEmail {
  const memberName = escapeHtml(data.memberName);
  const planName = escapeHtml(data.planName);
  const amountPaid = escapeHtml(data.amountPaid);
  const paymentMethod = escapeHtml(data.paymentMethod);
  const paymentDate = escapeHtml(data.paymentDate);
  const orgName = escapeHtml(data.orgName || 'Fit-Stack');
  const receiptNumber = data.receiptNumber ? escapeHtml(data.receiptNumber) : null;

  // El subject es texto plano (sin markup: no hay vector XSS); el HTML
  // usa las versiones escapadas.
  const subject = receiptNumber
    ? `Comprobante ${data.receiptNumber} — ${data.orgName}`
    : `Comprobante de pago — ${data.orgName}`;

  const note = data.hasAttachment
    ? 'Adjuntamos tu comprobante en PDF: es el documento válido de tu pago.'
    : 'Este pago es anterior al sistema de comprobantes correlativos: solicítalo en el establecimiento.';

  const bodyHtml = `
                <div class="client-info">
                    <div class="info-col">
                        <div class="info-label">Cliente</div>
                        <div class="info-value">${memberName}</div>
                    </div>
                    <div class="info-col" style="text-align: right;">
                        <div class="info-label">Fecha de Pago</div>
                        <div class="info-value">${paymentDate}</div>
                    </div>
                </div>

                <div class="item-row">
                    <div class="item-desc">Membresía: ${planName}</div>
                    <div class="item-price">${amountPaid}</div>
                </div>

                <div class="total-box">
                    <div class="total-row">
                        <div class="total-label">
                            <div class="total-label-text">Total Recibido</div>
                            <div style="font-size: 11px; color: #71717a; margin-top: 4px;">Vía ${paymentMethod}</div>
                        </div>
                        <div class="total-value">${amountPaid}</div>
                    </div>
                </div>

                <p style="font-size: 13px; color: #52525b; line-height: 1.6; margin-top: 16px;">${note}</p>`;

  return {
    subject,
    html: renderLightShell({
      headerTitle: 'Comprobante de Pago',
      headerSubtitle: receiptNumber ? `Comprobante ${receiptNumber}` : 'Comprobante de pago',
      bodyHtml,
      footerName: orgName,
    }),
  };
}
