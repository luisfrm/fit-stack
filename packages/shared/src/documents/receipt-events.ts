/* ── Documents / receipt-events — render queue contract ─────────────────
   `receipt.render` event of `fit-receipt-events`. Types-ONLY (no I/O,
   edge-safe): imported by api-worker (producer step 1 + issue) and
   jobs-worker (sweep + consumer) from `@workspace/shared` — neither app
   imports types from the other. A single type with `scope`: C2 reuses it
   without duplicating registration.
   ─────────────────────────────────────────────────────────────────────── */

import { isValidConsoleReceiptNumber, isValidPanelReceiptNumber } from './receipt-number';

export const RECEIPT_RENDER_EVENT_TYPE = 'receipt.render' as const;

/** Receipt issuer: gym (panel) or FitStack (platform, C2 reserved). */
export type ReceiptScope = 'panel' | 'platform';

export interface ReceiptRenderEvent {
  type: typeof RECEIPT_RENDER_EVENT_TYPE;
  scope: ReceiptScope;
  /** Panel: `payment.id`. Platform (C2): `platform_subscription_payment.id`. */
  paymentId: number;
  organizationId: string;
  /** Human correlative already allocated (validated Panel format). */
  receiptNumber: string;
}

export interface BuildReceiptRenderEventInput {
  paymentId: number;
  organizationId: string;
  receiptNumber: string;
  /** Default `'panel'`. Current phase never emits `'platform'` (C2 reserved). */
  scope?: ReceiptScope;
}

/**
 * Builds the validated event. Throws with an explicit message if invalid —
 * producer fails fast in development, never silencing.
 */
export function buildReceiptRenderEvent(
  input: BuildReceiptRenderEventInput,
): ReceiptRenderEvent {
  if (!Number.isInteger(input.paymentId) || input.paymentId < 1) {
    throw new Error(
      `buildReceiptRenderEvent: invalid paymentId (${String(input.paymentId)}).`,
    );
  }
  if (!input.organizationId || input.organizationId.trim().length === 0) {
    throw new Error('buildReceiptRenderEvent: organizationId is required.');
  }
  const scope = input.scope ?? 'panel';
  const validNumber =
    scope === 'platform'
      ? isValidConsoleReceiptNumber(input.receiptNumber)
      : isValidPanelReceiptNumber(input.receiptNumber);
  if (!validNumber) {
    throw new Error(
      `buildReceiptRenderEvent: invalid receiptNumber format for scope "${scope}" (${input.receiptNumber}).`,
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

/** Strict type-guard for consumer (unknown → ack + warn, no retry). */
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
