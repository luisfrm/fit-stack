import { renderLightShell, type RenderedEmail } from './layout';

export interface PaymentReceiptData {
  paymentId: number;
  memberName: string;
  planName: string;
  /** Ya formateado, p. ej. "50,00 USD". */
  amountPaid: string;
  paymentMethod: string;
  /** Ya formateado, p. ej. "05 de septiembre de 2026". */
  paymentDate: string;
  orgName: string;
}

/** Recibo de pago de membresía de gym para el cliente (tema comprobante). */
export function renderPaymentReceipt(data: PaymentReceiptData): RenderedEmail {
  const bodyHtml = `
                <div class="client-info">
                    <div class="info-col">
                        <div class="info-label">Cliente</div>
                        <div class="info-value">${data.memberName}</div>
                    </div>
                    <div class="info-col" style="text-align: right;">
                        <div class="info-label">Fecha de Emisión</div>
                        <div class="info-value">${data.paymentDate}</div>
                    </div>
                </div>

                <div class="item-row">
                    <div class="item-desc">Membresía: ${data.planName}</div>
                    <div class="item-price">${data.amountPaid}</div>
                </div>

                <div class="total-box">
                    <div class="total-row">
                        <div class="total-label">
                            <div class="total-label-text">Total Recibido</div>
                            <div style="font-size: 11px; color: #71717a; margin-top: 4px;">Vía ${data.paymentMethod}</div>
                        </div>
                        <div class="total-value">${data.amountPaid}</div>
                    </div>
                </div>`;

  return {
    subject: `Recibo de Pago - ${data.planName}`,
    html: renderLightShell({
      headerTitle: 'Comprobante de Pago',
      headerSubtitle: `Operación #${data.paymentId}`,
      bodyHtml,
      footerName: data.orgName || 'Fit-Stack',
    }),
  };
}
