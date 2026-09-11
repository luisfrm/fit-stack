/* ── Documents / masking — enmascarado de referencias sensibles ─────────
   Las referencias de pago (hashes bancarios, números de operación) son
   datos sensibles: se muestran parciales en UI, impresión y email.
   Los adjuntos `file` NO se tocan (siguen como link "VER CAPTURA").
   Funciones puras, sin I/O, edge-safe (Workers).
   ─────────────────────────────────────────────────────────────────────── */

import type { IPaymentMethodDetails } from '../types';

const MASK_CHAR = '•';
const MIN_MASKABLE_LENGTH = 7;

/**
 * Enmascara una referencia: conserva los primeros 4 y últimos 2
 * caracteres visibles (`123456789012` → `1234••••••12`).
 * Valores cortos (< 7) se ocultan por completo; vacío/null → `""`.
 * Nunca lanza.
 */
export function maskReference(value: string | null | undefined): string {
  if (value === null || value === undefined) return '';
  if (value.length === 0) return '';
  if (value.length < MIN_MASKABLE_LENGTH) return MASK_CHAR.repeat(value.length);
  const hiddenCount = value.length - 6;
  return `${value.slice(0, 4)}${MASK_CHAR.repeat(hiddenCount)}${value.slice(-2)}`;
}

/**
 * Enmascara un `paymentMethodDetails` canónico: `text`/`number` se
 * enmascaran, `file` se conserva íntegro (es un link, no un secreto).
 * Tolerante a filas legacy con forma de objeto (las devuelve intactas).
 */
export function maskPaymentDetails(
  details: IPaymentMethodDetails | Record<string, unknown> | null | undefined,
): IPaymentMethodDetails | Record<string, unknown> | null | undefined {
  if (!Array.isArray(details)) return details;
  return details.map((item) => {
    if (item.type === 'file') return item;
    return { ...item, value: maskReference(item.value) };
  });
}
