import { createDb } from '@workspace/database/factory';
import {
  payment,
  gymMember,
  organization,
  platformSubscriptionPayment,
  authMember,
  user,
} from '@workspace/database/schema';
import { sendEmail, type EmailHandlerEnv } from './email.handler';
import { renderPaymentReceipt } from '../templates/payment-receipt';
import { renderOrgPaymentReceived } from '../templates/org-payment-received';
import { formatCents, type CurrencyFormat } from '@workspace/shared';
import { and, eq } from 'drizzle-orm';

export interface PdfHandlerEnv extends EmailHandlerEnv {
  DATABASE_URL: string;
}

function formatDate(date: Date): string {
  return new Date(date).toLocaleDateString('es-ES', {
    day: '2-digit',
    month: 'long',
    year: 'numeric',
  });
}

/**
 * Recibo de pago de membresía de gym (email.payment_receipt): PDF-style HTML
 * para el cliente. Encolado automáticamente al validar un pago (create con
 * status validated, o PATCH processing → validated) y por el reenvío manual.
 */
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

  // Montos en centavos enteros (convención Money): display vía formatCents
  // con el formato de la org emisora.
  const orgFormat = (paymentData.org.currencyFormat ?? 'latam') as CurrencyFormat;
  const amountFormatted = formatCents(
    Number(paymentData.payment.amountPaid),
    paymentData.payment.currencyPaid,
    orgFormat,
  );

  const { subject, html } = renderPaymentReceipt({
    paymentId: paymentData.payment.id,
    memberName: `${paymentData.member.firstName} ${paymentData.member.lastName}`,
    planName: paymentData.payment.planSnapshotName,
    amountPaid: amountFormatted,
    paymentMethod: paymentData.payment.paymentMethod,
    paymentDate: formatDate(paymentData.payment.paymentDate),
    orgName: paymentData.org.name || 'Fit-Stack',
  });

  await sendEmail(env, {
    to: paymentData.member.email,
    subject,
    html,
  });
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
    .where(eq(platformSubscriptionPayment.id, payload.paymentId))
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

  const orgFormat = (paymentData.org.currencyFormat ?? 'latam') as CurrencyFormat;
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
    paymentDate: formatDate(paymentData.payment.paymentDate),
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
