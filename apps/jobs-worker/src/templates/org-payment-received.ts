import { renderDarkShell, type RenderedEmail } from './layout';

export interface OrgPaymentReceivedData {
  orgName: string;
  planName: string;
  /** Ya formateado, p. ej. "50,00 USD". */
  amountPaid: string;
  paymentMethod: string;
  /** Ya formateado, p. ej. "05 de septiembre de 2026". */
  paymentDate: string;
  payerName: string;
  /** true = el pago requiere revisión de soporte (status processing). */
  pendingReview: boolean;
}

/**
 * Confirmación de pago de suscripción SaaS (renovación autoservicio):
 * llega al usuario que registró el pago y a los owners de la org.
 * En estado `processing` aclara que el periodo se activa tras la
 * aprobación de soporte; en estado final agradecerá la renovación.
 */
export function renderOrgPaymentReceived(data: OrgPaymentReceivedData): RenderedEmail {
  const paragraphs = [
    `<strong>${data.payerName}</strong> registró un pago de <strong>${data.amountPaid}</strong> `
      + `vía <strong>${data.paymentMethod}</strong> para renovar la suscripción SaaS de <strong>${data.orgName}</strong>.`,
    `Plan: <strong>${data.planName}</strong> · Fecha de operación: ${data.paymentDate}.`,
    data.pendingReview
      ? 'El pago está <strong>en revisión</strong> por el equipo Fit-Stack. El periodo de la suscripción se extenderá automáticamente al aprobarse.'
      : 'El pago fue procesado correctamente. ¡Gracias por renovar!',
  ];

  return {
    subject: data.pendingReview
      ? `Pago en revisión — Suscripción de ${data.orgName}`
      : `Pago recibido — Suscripción de ${data.orgName}`,
    html: renderDarkShell({
      title: data.pendingReview ? 'Pago en Revisión' : 'Pago Recibido',
      paragraphs,
      buttonLabel: 'Ir al Panel',
      buttonUrl: '@@PANEL_URL@@',
      note: 'Si no reconoces esta operación, contacta al equipo Fit-Stack.',
    }),
  };
}
