import type { ITaxDetail } from '../types';
import type { ReceiptDocumentType } from './document-label-gate';
import { isReceiptNumber } from './receipt-number';

/**
 * Contrato único del comprobante renderizable. Un solo shape para el PDF
 * adjunto del email, la descarga del panel y la vista del console: evita que
 * dos renderizadores diverjan.
 *
 * Regla: el UUID técnico del pago (`payment.id` / `platform_subscription_payment.id`)
 * NUNCA vive en este contrato; el número correlativo humano es `identification.number`.
 */

export interface IReceiptIssuer {
  name: string;
  legalName?: string | null;
  taxId?: string | null;
  taxLabel?: string | null;
  address?: string | null;
  logoUrl?: string | null;
}

export interface IReceiptRecipient {
  name: string;
  documentId?: string | null;
  documentLabel?: string | null;
  email?: string | null;
  phone?: string | null;
}

export interface IReceiptIdentification {
  /** Correlativo humano (Panel `{slug}-{año}-{n}` o Console `FS-{n}`). */
  number: string;
  documentType: ReceiptDocumentType;
  documentLabel: string;
  issuedAt: string;
}

export interface IReceiptLine {
  planName: string;
  planPrice: number;
  planCurrency: string;
  periodStart?: string | null;
  periodEnd?: string | null;
}

export interface IReceiptAmounts {
  subtotal: number;
  taxDetails: ITaxDetail[];
  taxTotal: number;
  amountPaid: number;
  currencyPaid: string;
  primaryCurrency: string;
  exchangeRateApplied?: string | null;
  convertedAmount?: number | null;
}

export interface IReceiptPayment {
  method: string;
  /** Referencia ya enmascarada (nunca el valor completo). */
  reference?: string | null;
  paymentDate: string;
}

export interface IReceiptLegal {
  disclaimer: string[];
  /** "Generado con FitStack" (Panel) o "Emitido por FitStack" (Console). */
  issuerLine: string;
}

export interface IReceiptData {
  issuer: IReceiptIssuer;
  recipient: IReceiptRecipient;
  identification: IReceiptIdentification;
  line: IReceiptLine;
  amounts: IReceiptAmounts;
  payment: IReceiptPayment;
  legal: IReceiptLegal;
}

export interface ReceiptChecklistResult {
  ok: boolean;
  violations: string[];
}

const UUID_PATTERN =
  /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/i;
const RAW_ID_PATTERN = /^\d{4,}$/;

function collectUuidPaths(value: unknown, path: string, out: string[]): void {
  if (typeof value === 'string') {
    if (UUID_PATTERN.test(value)) out.push(path || '(root)');
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((item, index) => collectUuidPaths(item, `${path}[${index}]`, out));
    return;
  }
  if (value && typeof value === 'object') {
    for (const [key, nested] of Object.entries(value)) {
      collectUuidPaths(nested, path ? `${path}.${key}` : key, out);
    }
  }
}

/**
 * Checklist de integridad antes de generar el PDF. Devuelve `ok` y la lista de
 * violaciones: número presente y con formato humano, descargo legal presente,
 * tasa + equivalente cuando la moneda difiere de la principal, y ausencia de
 * UUID/id técnico visible.
 */
export function checklistPrePdf(data: IReceiptData): ReceiptChecklistResult {
  const violations: string[] = [];

  const number = data.identification.number?.trim() ?? '';
  if (!number) {
    violations.push('Falta el número correlativo del comprobante.');
  } else if (!isReceiptNumber(number)) {
    violations.push(`Número de comprobante con formato inválido: ${number}`);
  }
  if (RAW_ID_PATTERN.test(number)) {
    violations.push('El número parece un id técnico (solo dígitos), no un correlativo humano.');
  }

  if (!data.legal.disclaimer || data.legal.disclaimer.length === 0) {
    violations.push('Falta el descargo legal del emisor.');
  }

  const { currencyPaid, primaryCurrency, exchangeRateApplied, convertedAmount } = data.amounts;
  if (currencyPaid && primaryCurrency && currencyPaid !== primaryCurrency) {
    if (!exchangeRateApplied) {
      violations.push('La moneda pagada difiere de la principal y falta la tasa aplicada.');
    }
    if (convertedAmount === undefined || convertedAmount === null) {
      violations.push('La moneda pagada difiere de la principal y falta el equivalente convertido.');
    }
  }

  const uuidPaths: string[] = [];
  collectUuidPaths(data, '', uuidPaths);
  if (uuidPaths.length > 0) {
    violations.push(`Se detectó un UUID visible en: ${uuidPaths.join(', ')}`);
  }

  return { ok: violations.length === 0, violations };
}
