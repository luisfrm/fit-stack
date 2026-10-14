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
import { formatCents, type CurrencyFormat, type PaymentReceiptEvent } from '@workspace/shared';
import { and, eq } from 'drizzle-orm';

export interface PdfHandlerEnv extends EmailHandlerEnv {
  DATABASE_URL: string;
  FILES_BUCKET: R2Bucket;
}

function formatDate(date: Date, timezone: string): string {
  // Always in the emitter org's timezone (runtime UTC would split days).
  return new Date(date).toLocaleDateString('es-ES', {
    day: '2-digit',
    month: 'long',
    year: 'numeric',
    timeZone: timezone,
  });
}

/**
 * Gym membership payment receipt (email.payment_receipt): short notification
 * + PDF attachment read from R2 (never regenerated: the stored PDF is the
 * source of truth). Three branches through the shared attachment resolver:
 * - **A numbered with PDF** (`receipt_pdf_key` exists) → email with
 *   `<number>.pdf` attached, byte-identical to the panel download.
 * - **B historical** (`receipt_number IS NULL`, pre-system) → email without
 *   attachment, no error (only reachable via manual resend).
 * - **C number without PDF** → defensive, should not happen (the event is
 *   enqueued by step 2 after `completeReceiptPdf`): log + return without
 *   sending (the sweep will complete the PDF and re-enqueue the email).
 * Without `member.email` → log + return (issuance already happened in
 * api-worker; the failure is delivery-only, retrying would be useless).
 */
export async function handlePaymentReceipt(
  env: PdfHandlerEnv,
  payload: PaymentReceiptEvent
) {
  const db = createDb(env.DATABASE_URL);
  // Org-scoped read by construction (filters payment + member by org;
  // `undefined` if payment belongs to another org). The persisted number is
  // the source of truth: the event carries no number (legacy in-flight
  // events may carry a `receiptNumber` extra key — ignored on purpose).
  const composed = await createReceiptsRepository(db).getReceiptComposedData(
    payload.organizationId,
    payload.paymentId,
  );

  if (!composed?.member) {
    console.error(`Payment ${payload.paymentId} not found for email receipt`);
    return;
  }
  const { payment: paymentRow, member, organization: org } = composed;

  const email = member.email?.trim();
  if (!email) {
    console.warn(
      `Payment ${payload.paymentId}: member without email, issuance intact, delivery skipped.`,
    );
    return;
  }

  // No silent fallbacks: timezone and currencyFormat are NOT NULL.
  if (!org.timezone || !org.currencyFormat) {
    console.error(
      `Payment ${payload.paymentId}: org missing timezone/format, delivery skipped (misconfiguration, do not assume).`,
    );
    return;
  }
  const orgFormat = org.currencyFormat as CurrencyFormat;

  // Amounts in integer cents (Money convention): display via formatCents
  // with emitter org's format.
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

  // Voided (defensive): an in-flight event of a voided receipt is never sent —
  // it would carry the emission PDF, without the stamp. The deliverable of a
  // voided receipt is its sealed download (`receipt_voided_pdf_key`).
  if (paymentRow.receiptVoided) {
    console.warn(
      `Payment ${payload.paymentId}: receipt ${receiptNumber ?? '—'} VOIDED; send omitted (deliverable is stamped PDF).`,
    );
    return;
  }

  // Shared resolver (same one used by the org payment branch): `null` =
  // pre-system (send without attachment), `undefined` = PDF not ready (log +
  // ack; the sweep repairs it). The persisted number is the source of truth.
  const attachments = await resolveReceiptAttachment(
    env,
    'Payment',
    payload.paymentId,
    receiptNumber,
    receiptPdfKey,
  );
  if (attachments === undefined) {
    return;
  }

  const { subject, html } = renderPaymentReceiptShort({
    ...baseData,
    receiptNumber: receiptNumber ?? null,
    hasAttachment: attachments !== null,
  });
  await sendEmail(env, {
    to: email,
    subject,
    html,
    ...(attachments ? { attachments } : {}),
  });
}

type PdfAttachment = { filename: string; content: Uint8Array; contentType: string };

/**
 * Resolves the PDF attachment for a receipt email from R2 (never regenerated:
 * the stored PDF is the source of truth). Shared by both email branches
 * (member receipt and org payment confirmation).
 *
 * - `null`: no receipt number (pre-system path = send without attachment).
 * - `undefined`: abort the send (PDF not yet ready; the sweep repairs it).
 * - `PdfAttachment[]`: the bytes as stored, named `<number>.pdf`.
 *
 * `receiptNumber` is always the PERSISTED number of the row, never one carried
 * by the event (the queue contract has no number field).
 */
async function resolveReceiptAttachment(
  env: PdfHandlerEnv,
  logPrefix: string,
  paymentId: number,
  receiptNumber: string | null | undefined,
  receiptPdfKey: string | null | undefined,
): Promise<PdfAttachment[] | null | undefined> {
  if (!receiptNumber) return null; // No-number path: send without attachment.

  if (!receiptPdfKey) {
    console.error(
      `${logPrefix} ${paymentId}: número ${receiptNumber} sin PDF (evento fuera de orden); ack sin enviar, el barrido re-encolará.`,
    );
    return undefined; // Signal: abort send.
  }
  const stored = await env.FILES_BUCKET.get(receiptPdfKey);
  const bytes = stored ? new Uint8Array(await stored.arrayBuffer()) : null;
  if (!bytes) {
    console.error(
      `${logPrefix} ${paymentId}: número ${receiptNumber} con receipt_pdf_key sin objeto en R2, envío omitido (el barrido lo repara).`,
    );
    return undefined; // Signal: abort send.
  }
  return [{ filename: `${receiptNumber}.pdf`, content: bytes, contentType: 'application/pdf' }];
}

/**
 * SaaS subscription payment confirmation (email.org_payment_received):
 * delivered to user who registered payment (payer) and org owners (deduplicated).
 * With status `processing` email clarifies period activates upon support approval.
 * From C2: if payment is numbered with PDF, attaches R2 bytes as-is (never regenerates);
 * numbered without PDF → log + return (sweep repairs); without number → HTML without attachment.
 */
export async function handleOrgPaymentReceived(
  env: PdfHandlerEnv,
  payload: { paymentId: number; organizationId: string; payerEmail?: string; payerName?: string }
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

  // Org owners emails (auth_member role=owner → user.email)
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

  const payerEmail = payload.payerEmail?.trim() || null;
  if (!payerEmail) {
    console.log(
      `Platform payment ${payload.paymentId}: sin payer (payer-missing); se notifica solo a owners.`,
    );
  }
  const recipients = new Set<string>(
    [payerEmail, ...ownerRows.map((r) => r.email)].filter(
      (e): e is string => !!e && e.trim().length > 0,
    ),
  );

  // No silent fallbacks: timezone and currencyFormat are NOT NULL.
  if (!paymentData.org.timezone || !paymentData.org.currencyFormat) {
    console.error(
      `Platform payment ${payload.paymentId}: org missing timezone/format, delivery skipped (misconfiguration, do not assume).`,
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
  const receiptNumber = paymentData.payment.receiptNumber;
  const receiptPdfKey = paymentData.payment.receiptPdfKey;

  // Voided (defensive, mirrors Panel): never send issuance PDF of voided
  // receipt; deliverable is stamped PDF.
  if (paymentData.payment.receiptVoided) {
    console.warn(
      `Platform payment ${payload.paymentId}: receipt ${receiptNumber ?? '—'} VOIDED; delivery skipped (deliverable is stamped PDF).`,
    );
    return;
  }
  const payerName = payload.payerName?.trim() || 'El equipo de tu organización';

  // Target-based CTA: URL decided by WHO recipient is, never template.
  // Today all recipients are staff (payer + owners) → panel.
  // Future extension (portal app for member/trainer): target will be
  // `env.PORTAL_URL` + `target: 'portal'` in invite contract.
  const panelUrl = env.PANEL_URL?.trim();
  if (!panelUrl) {
    throw new Error(
      `Platform payment ${payload.paymentId}: PANEL_URL ausente; no se puede construir el CTA "Ir al Panel" (sin fallback a localhost).`,
    );
  }

  const { subject, html } = renderOrgPaymentReceived({
    orgName: paymentData.org.name || 'tu organización',
    planName: paymentData.payment.planSnapshotName,
    amountPaid: amountFormatted,
    paymentMethod: paymentData.payment.paymentMethod,
    paymentDate: formatDate(paymentData.payment.paymentDate, paymentData.org.timezone),
    payerName,
    pendingReview,
    panelUrl,
  });

  // Shared resolver: undefined = abort (PDF not yet ready; the sweep repairs it).
  const attachments = await resolveReceiptAttachment(
    env,
    'Platform payment',
    payload.paymentId,
    receiptNumber,
    receiptPdfKey,
  );
  if (attachments === undefined) return;

  for (const to of recipients) {
    try {
      await sendEmail(env, { to, subject, html, ...(attachments ? { attachments } : {}) });
    } catch (err) {
      // A recipient with an invalid email must not block the rest.
      console.error(`Failed to send org payment email to ${to}:`, err);
    }
  }
}
