import { createDb } from '@workspace/database/factory';
import { payment, gymMember, subscription, organization } from '@workspace/database/schema';
import { sendEmail, type EmailHandlerEnv } from './email.handler';
import { eq } from 'drizzle-orm';

export interface PdfHandlerEnv extends EmailHandlerEnv {
  DATABASE_URL: string;
}

export async function handlePaymentReceipt(
  env: PdfHandlerEnv,
  payload: { paymentId: number; organizationId: string }
) {
  const db = createDb(env.DATABASE_URL);

  const [paymentData] = await db
    .select({
      payment,
      member: gymMember,
      org: organization,
    })
    .from(payment)
    .innerJoin(gymMember, eq(payment.memberId, gymMember.id))
    .innerJoin(organization, eq(payment.organizationId, organization.id))
    .where(eq(payment.id, payload.paymentId))
    .limit(1);

  if (!paymentData || !paymentData.member) {
    console.error(`Payment ${payload.paymentId} not found for email receipt`);
    return;
  }

  const dateStr = new Date(paymentData.payment.paymentDate).toLocaleDateString('es-ES', {
    day: '2-digit',
    month: 'long',
    year: 'numeric',
  });

  const amountPaidFormatted = `${Number.parseFloat(paymentData.payment.amountPaid.toString()).toLocaleString('es-ES')} ${paymentData.payment.currencyPaid}`;

  const htmlContent = `
    <!DOCTYPE html>
    <html>
    <head>
        <meta charset="utf-8">
        <style>
            body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #f4f4f5; color: #18181b; margin: 0; padding: 20px; }
            .container { max-width: 600px; margin: 20px auto; background: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1); border: 1px solid #e4e4e7; }
            .header { background: #facc15; padding: 40px; text-align: center; }
            .header h1 { margin: 0; font-size: 24px; font-weight: 800; color: #000000; text-transform: uppercase; letter-spacing: 0.1em; }
            .header p { margin: 8px 0 0; font-size: 12px; font-weight: 700; color: rgba(0,0,0,0.5); font-family: monospace; }
            .content { padding: 40px; }
            .client-info { display: table; width: 100%; margin-bottom: 40px; }
            .info-col { display: table-cell; width: 50%; }
            .info-label { font-size: 10px; font-weight: 700; color: #71717a; text-transform: uppercase; margin-bottom: 4px; }
            .info-value { font-size: 15px; font-weight: 700; color: #000000; }
            .item-row { display: table; width: 100%; padding: 16px 0; border-bottom: 1px solid #f4f4f5; }
            .item-desc { display: table-cell; width: 70%; font-size: 14px; color: #18181b; font-weight: 600; }
            .item-price { display: table-cell; width: 30%; text-align: right; font-size: 16px; font-weight: 800; color: #000000; }
            .total-box { margin-top: 40px; background: #fafafa; padding: 24px; border-radius: 8px; border: 1px dashed #e4e4e7; }
            .total-row { display: table; width: 100%; }
            .total-label { display: table-cell; vertical-align: middle; }
            .total-label-text { font-size: 10px; font-weight: 800; color: #eab308; text-transform: uppercase; letter-spacing: 0.1em; }
            .total-value { display: table-cell; text-align: right; font-size: 24px; font-weight: 800; color: #eab308; }
            .footer { padding: 20px; text-align: center; font-size: 11px; color: #a1a1aa; border-top: 1px solid #f4f4f5; }
        </style>
    </head>
    <body>
        <div class="container">
            <div class="header">
                <h1>Comprobante de Pago</h1>
                <p>Operación #${paymentData.payment.id}</p>
            </div>
            <div class="content">
                <div class="client-info">
                    <div class="info-col">
                        <div class="info-label">Cliente</div>
                        <div class="info-value">${paymentData.member.firstName} ${paymentData.member.lastName}</div>
                    </div>
                    <div class="info-col" style="text-align: right;">
                        <div class="info-label">Fecha de Emisión</div>
                        <div class="info-value">${dateStr}</div>
                    </div>
                </div>
                
                <div class="item-row">
                    <div class="item-desc">Membresía: ${paymentData.payment.planSnapshotName}</div>
                    <div class="item-price">${amountPaidFormatted}</div>
                </div>

                <div class="total-box">
                    <div class="total-row">
                        <div class="total-label">
                            <div class="total-label-text">Total Recibido</div>
                            <div style="font-size: 11px; color: #71717a; margin-top: 4px;">Vía ${paymentData.payment.paymentMethod}</div>
                        </div>
                        <div class="total-value">${amountPaidFormatted}</div>
                    </div>
                </div>
            </div>
            <div class="footer">
                &copy; ${new Date().getFullYear()} ${paymentData.org.name || 'Fit-Stack'}.
            </div>
        </div>
    </body>
    </html>
  `;

  await sendEmail(env, {
    to: paymentData.member.email,
    subject: `Recibo de Pago - ${paymentData.payment.planSnapshotName}`,
    html: htmlContent,
  });
}
