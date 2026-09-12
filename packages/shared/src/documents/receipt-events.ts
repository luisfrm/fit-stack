/* ── Documents / receipt-events — contrato de cola de render ─────────────
   Evento `receipt.render` de `fit-receipt-events`. Tipo SOLO-tipos (sin I/O,
   edge-safe): lo importan api-worker (productor paso 1 + issue) y
   jobs-worker (barrido + consumer) desde `@workspace/shared` — ninguna app
   importa tipos de la otra. Un solo tipo con `scope`: C2 lo reutiliza sin
   duplicar registro.
   ─────────────────────────────────────────────────────────────────────── */

import { isValidConsoleReceiptNumber, isValidPanelReceiptNumber } from './receipt-number';

export const RECEIPT_RENDER_EVENT_TYPE = 'receipt.render' as const;

/** Emisor del comprobante: gym (panel) o FitStack (platform, reservado C2). */
export type ReceiptScope = 'panel' | 'platform';

export interface ReceiptRenderEvent {
  type: typeof RECEIPT_RENDER_EVENT_TYPE;
  scope: ReceiptScope;
  /** Panel: `payment.id`. Platform (C2): `platform_subscription_payment.id`. */
  paymentId: number;
  organizationId: string;
  /** Correlativo humano ya asignado (formato Panel validado). */
  receiptNumber: string;
}

export interface BuildReceiptRenderEventInput {
  paymentId: number;
  organizationId: string;
  receiptNumber: string;
  /** Default `'panel'`. Fase actual nunca emite `'platform'` (reservado C2). */
  scope?: ReceiptScope;
}

/**
 * Construye el evento validado. Lanza con mensaje explícito si inválido —
 * el productor lo deja fallar en desarrollo, nunca silencia.
 */
export function buildReceiptRenderEvent(
  input: BuildReceiptRenderEventInput,
): ReceiptRenderEvent {
  if (!Number.isInteger(input.paymentId) || input.paymentId < 1) {
    throw new Error(
      `buildReceiptRenderEvent: paymentId inválido (${String(input.paymentId)}).`,
    );
  }
  if (!input.organizationId || input.organizationId.trim().length === 0) {
    throw new Error('buildReceiptRenderEvent: organizationId es obligatorio.');
  }
  const scope = input.scope ?? 'panel';
  const validNumber =
    scope === 'platform'
      ? isValidConsoleReceiptNumber(input.receiptNumber)
      : isValidPanelReceiptNumber(input.receiptNumber);
  if (!validNumber) {
    throw new Error(
      `buildReceiptRenderEvent: receiptNumber con formato inválido para scope "${scope}" (${input.receiptNumber}).`,
    );
  }
  return {
    type: RECEIPT_RENDER_EVENT_TYPE,
    scope,
    paymentId: input.paymentId,
    organizationId: input.organizationId,
    receiptNumber: input.receiptNumber,
  };
}

/** Type-guard estricto para el consumer (lo desconocido → ack + warn, no retry). */
export function isReceiptRenderEvent(v: unknown): v is ReceiptRenderEvent {
  if (typeof v !== 'object' || v === null) return false;
  const e = v as Record<string, unknown>;
  return (
    e['type'] === RECEIPT_RENDER_EVENT_TYPE &&
    (e['scope'] === 'panel' || e['scope'] === 'platform') &&
    typeof e['paymentId'] === 'number' &&
    typeof e['organizationId'] === 'string' &&
    typeof e['receiptNumber'] === 'string'
  );
}
