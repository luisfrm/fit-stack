import { createDb } from '@workspace/database/factory';
import { createReceiptsRepository } from '@workspace/database/repositories/receipts';
import {
  organization,
  platformSubscriptionPayment,
  authMember,
  user,
} from '@workspace/database/schema';
import { sendEmail, type EmailHandlerEnv } from './email.handler';
import { renderPaymentReceiptShort } from '../templates/payment-receipt-short';
import { renderOrgPaymentReceived } from '../templates/org-payment-received';
import { formatCents, type CurrencyFormat } from '@workspace/shared';
import { and, eq } from 'drizzle-orm';

export interface PdfHandlerEnv extends EmailHandlerEnv {
  DATABASE_URL: string;
  FILES_BUCKET: R2Bucket;
}

function formatDate(date: Date, timezone: string): string {
  // Siempre en la TZ de la org emisora (UTC del runtime partiría días).
  return new Date(date).toLocaleDateString('es-ES', {
    day: '2-digit',
    month: 'long',
    year: 'numeric',
    timeZone: timezone,
  });
}

/**
 * Recibo de pago de membresía de gym (email.payment_receipt): notificación
 * corta + PDF adjunto leído desde R2 (nunca regenerado: el PDF es la
 * fuente de verdad). Tres ramas:
 * - **A numerado con PDF** (`receipt_pdf_key` existe) → email con adjunto
 *   `<número>.pdf` idéntico byte-a-byte al descargado en el panel.
 * - **B histórico** (`receipt_number IS NULL`, pre-sistema) → email sin
 *   adjunto, sin error (viene solo del reenvío manual).
 * - **C número sin PDF** → defensiva, no debería ocurrir (el evento se
 *   encola desde el paso 2 tras `completeReceiptPdf`): log + return sin
 *   enviar (el barrido de Fase 2 completará el PDF y re-encolará el email).
 * Sin `member.email` → log + return (la emisión ya ocurrió en api-worker;
 * el fallo es solo de envío, reintentar sería inútil).
 */
export async function handlePaymentReceipt(
  env: PdfHandlerEnv,
  payload: { paymentId: number; organizationId: string; receiptNumber?: string }
) {
  const db = createDb(env.DATABASE_URL);
  // Lectura org-scoped por construcción (filtra pago + miembro por org;
  // `undefined` también cuando el pago es de otra org). El `receiptNumber?`
  // del evento es solo hint de observabilidad: la verdad vive en DB.
  const composed = await createReceiptsRepository(db).getReceiptComposedData(
    payload.organizationId,
    payload.paymentId,
  );

  if (!composed || !composed.member) {
    console.error(`Payment ${payload.paymentId} not found for email receipt`);
    return;
  }
  const { payment: paymentRow, member, organization: org } = composed;

  const email = member.email?.trim();
  if (!email) {
    console.warn(
      `Payment ${payload.paymentId}: miembro sin correo, emisión intacta, envío omitido.`,
    );
    return;
  }

  // Sin fallbacks silenciosos: timezone y currencyFormat son NOT NULL.
  if (!org.timezone || !org.currencyFormat) {
    console.error(
      `Payment ${payload.paymentId}: org sin timezone/formato, envío omitido (mala config, no asumir).`,
    );
    return;
  }
  const orgFormat = org.currencyFormat as CurrencyFormat;

  // Montos en centavos enteros (convención Money): display vía formatCents
  // con el formato de la org emisora.
  const amountFormatted = formatCents(
    Number(paymentRow.amountPaid),
    paymentRow.currencyPaid,
    orgFormat,
  );
  const orgName = org.legalName || org.name || 'Fit-Stack';
  const memberName =
    [member.firstName, member.lastName].filter(Boolean).join(' ') || 'Cliente';
  const baseData = {
    memberName,
    planName: paymentRow.planSnapshotName,
    amountPaid: amountFormatted,
    paymentMethod: paymentRow.paymentMethod,
    paymentDate: formatDate(paymentRow.paymentDate, org.timezone),
    orgName,
  };

  const receiptNumber = paymentRow.receiptNumber;
  const receiptPdfKey = paymentRow.receiptPdfKey;

  // Rama B — histórico pre-sistema: sin adjunto, sin error.
  if (!receiptNumber) {
    const { subject, html } = renderPaymentReceiptShort({
      ...baseData,
      receiptNumber: null,
      hasAttachment: false,
    });
    await sendEmail(env, { to: email, subject, html });
    return;
  }

  // Rama A — numerado con PDF: adjunta los bytes de R2 tal cual.
  if (receiptPdfKey) {
    const stored = await env.FILES_BUCKET.get(receiptPdfKey);
    const bytes = stored ? new Uint8Array(await stored.arrayBuffer()) : null;
    if (!bytes) {
      // R2 inconsistente (key seteada pero objeto ausente): como Rama C.
      console.error(
        `Payment ${payload.paymentId}: número ${receiptNumber} (evento: ${payload.receiptNumber ?? '—'}) con receipt_pdf_key sin objeto en R2, envío omitido (el barrido lo repara).`,
      );
      return;
    }
    const { subject, html } = renderPaymentReceiptShort({
      ...baseData,
      receiptNumber,
      hasAttachment: true,
    });
    await sendEmail(env, {
      to: email,
      subject,
      html,
      attachments: [
        {
          filename: `${receiptNumber}.pdf`,
          content: bytes,
          contentType: 'application/pdf',
        },
      ],
    });
    return;
  }

  // Rama C — número sin PDF: defensiva, log + ack sin enviar.
  console.error(
    `Payment ${payload.paymentId}: número ${receiptNumber} (evento: ${payload.receiptNumber ?? '—'}) sin PDF (evento fuera de orden); ack sin enviar, el barrido re-encolará.`,
  );
}

/**
 * Confirmación de pago de suscripción SaaS (email.org_payment_received):
 * llega al usuario que registró el pago (payer) y a los owners de la
 * organización (deduplicados). Con status `processing` el email aclara que
 * el periodo se activa al aprobar soporte.
 */
export async function handleOrgPaymentReceived(
  env: PdfHandlerEnv,
  payload: { paymentId: number; organizationId: string; payerEmail: string; payerName: string }
) {
  const db = createDb(env.DATABASE_URL);

  const [paymentData] = await db
    .select({
      payment: platformSubscriptionPayment,
      org: organization,
    })
    .from(platformSubscriptionPayment)
    .innerJoin(organization, eq(platformSubscriptionPayment.organizationId, organization.id))
    .where(
      and(
        eq(platformSubscriptionPayment.id, payload.paymentId),
        eq(platformSubscriptionPayment.organizationId, payload.organizationId),
      ),
    )
    .limit(1);

  if (!paymentData) {
    console.error(`Platform payment ${payload.paymentId} not found for org payment email`);
    return;
  }

  // Emails de los owners de la org (auth_member role=owner → user.email)
  const ownerRows = await db
    .select({ email: user.email })
    .from(authMember)
    .innerJoin(user, eq(authMember.userId, user.id))
    .where(
      and(
        eq(authMember.organizationId, payload.organizationId),
        eq(authMember.role, 'owner'),
      ),
    );

  const recipients = new Set<string>([payload.payerEmail, ...ownerRows.map((r) => r.email)]);

  // Sin fallbacks silenciosos: timezone y currencyFormat son NOT NULL.
  if (!paymentData.org.timezone || !paymentData.org.currencyFormat) {
    console.error(
      `Platform payment ${payload.paymentId}: org sin timezone/formato, envío omitido (mala config, no asumir).`,
    );
    return;
  }
  const orgFormat = paymentData.org.currencyFormat as CurrencyFormat;
  const amountFormatted = formatCents(
    Number(paymentData.payment.amountPaid),
    paymentData.payment.currencyPaid,
    orgFormat,
  );
  const pendingReview = paymentData.payment.status === 'processing';

  const { subject, html } = renderOrgPaymentReceived({
    orgName: paymentData.org.name || 'tu organización',
    planName: paymentData.payment.planSnapshotName,
    amountPaid: amountFormatted,
    paymentMethod: paymentData.payment.paymentMethod,
    paymentDate: formatDate(paymentData.payment.paymentDate, paymentData.org.timezone),
    payerName: payload.payerName,
    pendingReview,
  });

  for (const to of recipients) {
    try {
      await sendEmail(env, { to, subject, html });
    } catch (err) {
      // Un destinatario con email inválido no debe bloquear a los demás
      console.error(`Failed to send org payment email to ${to}:`, err);
    }
  }
}
