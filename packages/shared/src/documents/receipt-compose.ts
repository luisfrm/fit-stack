/* ── Documents / receipt-compose — builder puro de ReceiptData ───────────
   Convierte filas crudas (`getReceiptComposedData`) en el contrato
   `ReceiptData`. Puro, sin I/O, edge-safe: lo llaman api-worker
   (`GET /:id/receipt`) y jobs-worker (`handleReceiptRender`) con el MISMO
   resultado — ninguna de las dos apps implementa el compose por su cuenta.
   Reglas: impuestos LEÍDOS del pago (nunca recalculados), emisor congelado
   en snapshots, `paymentMethodDetails` enmascarado, UUID solo como
   `internalPaymentId`. Interfaz estructural mínima (NO importa runtime de
   `@workspace/database`: evita ciclo shared→database).
   ─────────────────────────────────────────────────────────────────────── */

import { resolveFiscalProfile } from './fiscal-profile';
import { resolveDocumentLabel } from './document-label-gate';
import { maskPaymentDetails } from './masking';
import type { ITaxDetail, IPaymentMethodDetails } from '../types';
import type {
  ReceiptData,
  ReceiptDocumentType,
  ReceiptMethod,
} from './receipt-data';

/** Date input value (Date instance or ISO string). */
export type DateInput = Date | string;

/** Nullable date input for optional temporal fields. */
export type NullableDate = DateInput | null;

/** Fila de pago con lo necesario para componer (centavos enteros). */
export interface ComposePayment {
  id: number;
  amountPaid: number;
  currencyPaid: string;
  exchangeRateApplied?: string | null;
  paymentMethod: string;
  paymentMethodDetails?: unknown;
  paymentDate: DateInput;
  subtotal?: number | null;
  taxTotal?: number | null;
  taxDetails?: unknown;
  receiptNumber: string | null;
  documentType?: string | null;
  receiptIssuedAt?: NullableDate;
  receiptVoided?: boolean | null;
  /** Snapshot congelado al registrar el pago (fuente del nombre del plan). */
  planSnapshotName?: string | null;
  planSnapshotCurrency?: string | null;
}

export interface ComposeOrganization {
  name: string;
  legalName?: string | null;
  taxId?: string | null;
  address?: string | null;
  countryCode: string;
  primaryCurrency: string;
  timezone?: string | null;
  fiscalConfig?: unknown;
}

export interface ComposeMember {
  firstName?: string | null;
  lastName?: string | null;
  documentId?: string | null;
}

export interface ComposeSubscription {
  startDate?: NullableDate;
  endDate?: NullableDate;
}

export interface ComposeReceiptInput {
  receiptNumber: string;
  documentType: ReceiptDocumentType;
  issuedAt: DateInput;
  payment: ComposePayment;
  organization: ComposeOrganization;
  member: ComposeMember | null;
  subscription: ComposeSubscription | null;
}

function toIso(value: DateInput): string {
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) {
    throw new TypeError(`buildReceiptDataFromComposed: fecha inválida (${String(value)}).`);
  }
  return d.toISOString();
}

function asTaxDetails(value: unknown, method: string): ITaxDetail[] {
  if (!Array.isArray(value)) {
    throw new TypeError(
      `${method}: impuestos no persistidos en el pago (tax_details ausente). El paso 1 siempre los persiste; si falta es bug, no se inventa.`,
    );
  }
  return value.map((line) => {
    const l = line as { name?: unknown; rate?: unknown; amount?: unknown };
    if (
      typeof l.name !== 'string' ||
      typeof l.rate !== 'number' ||
      typeof l.amount !== 'number'
    ) {
      throw new TypeError(
        `${method}: línea de impuesto persistida inválida (${JSON.stringify(line)}).`,
      );
    }
    return { name: l.name, rate: l.rate, amount: l.amount };
  });
}

/**
 * Arma `ReceiptData` desde filas crudas. Lanza si faltan los impuestos
 * persistidos o fechas inválidas. NO valida el checklist (lo hace el
 * caller con `checklistPrePdf` y decide).
 */
export function buildReceiptDataFromComposed(
  input: ComposeReceiptInput,
): ReceiptData {
  const { payment, organization, member, subscription } = input;

  if (payment.subtotal == null || payment.taxTotal == null) {
    throw new Error(
      'buildReceiptDataFromComposed: impuestos no persistidos en el pago (subtotal/tax_total ausentes).',
    );
  }
  const taxDetails = asTaxDetails(payment.taxDetails, 'buildReceiptDataFromComposed');

  const profile = resolveFiscalProfile(organization.countryCode, organization.fiscalConfig);
  const label = resolveDocumentLabel({
    taxId: organization.taxId,
    isFormalTaxpayer: profile.isFormalTaxpayer,
  });

  const masked = maskPaymentDetails(
    payment.paymentMethodDetails as
    | IPaymentMethodDetails
    | Record<string, unknown>
    | null
    | undefined,
  );
  let maskedDetails: ReceiptMethod['maskedDetails'];
  if (Array.isArray(masked)) {
    maskedDetails = masked.map((item) => ({
      label: String(item.label ?? ''),
      value: String(item.value ?? ''),
    }));
  }

  const memberName = member
    ? `${member.firstName ?? ''} ${member.lastName ?? ''}`.trim() || 'Miembro'
    : 'Miembro';

  return {
    emitter: {
      name: organization.name,
      legalName: organization.legalName ?? null,
      taxId: organization.taxId ?? null,
      taxLabel: profile.taxLabel,
      address: organization.address ?? null,
      countryCode: organization.countryCode,
      currency: organization.primaryCurrency,
    },
    recipient: {
      name: memberName,
      documentId: member?.documentId ?? null,
      docLabel: profile.docLabel,
    },
    document: {
      number: input.receiptNumber,
      type: input.documentType,
      label,
      issuedAt: toIso(input.issuedAt),
    },
    sale: {
      planName: payment.planSnapshotName?.trim() || 'Plan de membresía',
      periodStart: subscription?.startDate ? toIso(subscription.startDate) : toIso(input.issuedAt),
      periodEnd: subscription?.endDate ? toIso(subscription.endDate) : toIso(input.issuedAt),
      paymentDate: toIso(payment.paymentDate),
    },
    amounts: {
      subtotal: payment.subtotal,
      taxDetails,
      taxTotal: payment.taxTotal,
      total: payment.amountPaid,
      currencyPaid: payment.currencyPaid,
      baseCurrency: payment.planSnapshotCurrency ?? organization.primaryCurrency,
      exchangeRateApplied: payment.exchangeRateApplied ?? null,
    },
    method: {
      name: payment.paymentMethod,
      maskedDetails,
    },
    footer: {
      disclaimer: profile.disclaimer,
      generatedBy: 'Generado con FitStack',
    },
    timezone: organization.timezone ?? undefined,
    voided: payment.receiptVoided ?? false,
    internalPaymentId: payment.id,
  };
}
