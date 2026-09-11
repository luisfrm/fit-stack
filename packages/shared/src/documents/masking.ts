import type { IPaymentMethodDetail, IPaymentMethodDetails } from '../types';

/**
 * Enmascarado de referencias sensibles para comprobantes.
 *
 * Regla: el número de cuenta/tarjeta/referencia nunca se muestra completo en
 * un PDF, en la UI ni en un email. Las capturas (`type: 'file'`) son links, no
 * texto: se dejan intactas (el archivo sigue accesible al staff autorizado).
 */

export const SENSITIVE_LABEL_PATTERN = /ref|cuenta|tarjeta|hash|comprobante|account|card/i;

const DEFAULT_VISIBLE_LAST = 4;

/**
 * Enmascara un valor dejando visibles los últimos `visibleLast` caracteres.
 * Valores vacíos se devuelven vacíos; valores más cortos que el margen se
 * enmascaran por completo.
 */
export function maskReference(value: string, options?: { visibleLast?: number }): string {
  const raw = value ?? '';
  if (!raw) return '';

  const visibleLast = options?.visibleLast ?? DEFAULT_VISIBLE_LAST;
  if (visibleLast <= 0) return '*'.repeat(raw.length);
  if (raw.length <= visibleLast) return '*'.repeat(raw.length);

  const hidden = raw.slice(0, raw.length - visibleLast);
  const visible = raw.slice(raw.length - visibleLast);
  return `${'*'.repeat(hidden.length)}${visible}`;
}

function isSensitiveLabel(label: string): boolean {
  return SENSITIVE_LABEL_PATTERN.test(label);
}

/**
 * Aplica `maskReference` a los items sensibles de `paymentMethodDetails`.
 * Acepta el contrato canónico (array) y tolera la forma legacy (objeto).
 */
export function maskPaymentDetails(
  details?: IPaymentMethodDetails | Record<string, unknown> | null,
): IPaymentMethodDetails | Record<string, unknown> | null {
  if (!details) return null;

  if (Array.isArray(details)) {
    return details.map((detail: IPaymentMethodDetail) => {
      if (detail.type === 'file') return detail;
      if (isSensitiveLabel(detail.label)) {
        return { ...detail, value: maskReference(detail.value) };
      }
      return detail;
    });
  }

  const masked: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(details)) {
    if (key !== 'last4' && isSensitiveLabel(key) && typeof value === 'string') {
      masked[key] = maskReference(value);
    } else {
      masked[key] = value;
    }
  }
  return masked;
}
