import { renderDarkShell, escapeHtml, type RenderedEmail } from './layout';

export interface OrgPaymentReceivedData {
  orgName: string;
  planName: string;
  /** Preformatted, e.g. "50,00 USD". */
  amountPaid: string;
  paymentMethod: string;
  /** Preformatted, e.g. "05 de septiembre de 2026". */
  paymentDate: string;
  payerName: string;
  /** true = payment requires support review (processing status). */
  pendingReview: boolean;
  /**
   * CTA URL ("Go to Panel"). Resolved by handler based on recipient —
   * never template. Required without default (§10: no silent fallback).
   */
  panelUrl: string;
}

/**
 * SaaS subscription payment confirmation (self-service renewal):
 * delivered to user who registered payment and org owners.
 * Under `processing` status clarifies period activates upon support
 * approval; under final status acknowledges renewal.
 *
 * All interpolated values are operator/user inputs: escaped.
 */
export function renderOrgPaymentReceived(data: OrgPaymentReceivedData): RenderedEmail {
  const orgName = escapeHtml(data.orgName);
  const paragraphs = [
    `<strong>${escapeHtml(data.payerName)}</strong> registró un pago de <strong>${escapeHtml(data.amountPaid)}</strong> `
      + `vía <strong>${escapeHtml(data.paymentMethod)}</strong> para renovar la suscripción SaaS de <strong>${orgName}</strong>.`,
    `Plan: <strong>${escapeHtml(data.planName)}</strong> · Fecha de operación: ${escapeHtml(data.paymentDate)}.`,
    data.pendingReview
      ? 'El pago está <strong>en revisión</strong> por el equipo Fit-Stack. El periodo de la suscripción se extenderá automáticamente al aprobarse.'
      : 'El pago fue procesado correctamente. ¡Gracias por renovar!',
  ];

  return {
    subject: data.pendingReview
      ? `Pago en revisión — Suscripción de ${orgName}`
      : `Pago recibido — Suscripción de ${orgName}`,
    html: renderDarkShell({
      title: data.pendingReview ? 'Pago en Revisión' : 'Pago Recibido',
      paragraphs,
      buttonLabel: 'Ir al Panel',
      buttonUrl: data.panelUrl,
      note: 'Si no reconoces esta operación, contacta al equipo Fit-Stack.',
    }),
  };
}
