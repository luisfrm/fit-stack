import { escapeHtml, renderLightShell, type RenderedEmail } from './layout';

export interface PaymentReceiptShortData {
  /** Human correlative number (never `payment.id`). Absent = historical pre-system. */
  receiptNumber?: string | null;
  memberName: string;
  planName: string;
  /** Preformatted, e.g. "50,00 USD". */
  amountPaid: string;
  paymentMethod: string;
  /** Preformatted, e.g. "05 de septiembre de 2026". */
  paymentDate: string;
  orgName: string;
  /** `true` when PDF is attached (PDF is single source of truth). */
  hasAttachment: boolean;
}

/**
 * Short receipt notification: body summarizes transaction and
 * attached PDF is single source of truth (never regenerated here).
 * Technical UUID (`payment.id`) NEVER appears: only correlative receipt number.
 */
export function renderPaymentReceiptShort(data: PaymentReceiptShortData): RenderedEmail {
  const memberName = escapeHtml(data.memberName);
  const planName = escapeHtml(data.planName);
  const amountPaid = escapeHtml(data.amountPaid);
  const paymentMethod = escapeHtml(data.paymentMethod);
  const paymentDate = escapeHtml(data.paymentDate);
  const orgName = escapeHtml(data.orgName || 'Fit-Stack');
  const receiptNumber = data.receiptNumber ? escapeHtml(data.receiptNumber) : null;

  // Subject is plain text (no markup: no XSS vector); HTML uses escaped versions.
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
