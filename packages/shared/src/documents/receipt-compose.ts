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

export function assertPersistedTaxDetails(value: unknown, method: string): ITaxDetail[] {
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

/** Detalles enmascarados al contrato `ReceiptMethod` (nada crudo visible). */
export function toReceiptMaskedDetails(masked: unknown): ReceiptMethod['maskedDetails'] {
  if (!Array.isArray(masked)) return undefined;
  return masked.map((item) => {
    const it = item as { label?: unknown; value?: unknown };
    return { label: String(it.label ?? ''), value: String(it.value ?? '') };
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
  const taxDetails = assertPersistedTaxDetails(payment.taxDetails, 'buildReceiptDataFromComposed');

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
  const maskedDetails = toReceiptMaskedDetails(masked);

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

/* ── Comprobante SaaS (Console, C2) ────────────────────────────────────
   Emisor = FitStack (keys `platform_setting`, C1); receptor = la org.
   Perfil fiscal e impuestos desde el país del receptor SIN override (la
   org no decide su IVA); país desconocido → error visible. Emisor sin
   país configurado usa el país receptor como proxy (PENDING §8).
   Puro, sin I/O, edge-safe. Interfaz estructural mínima (sin imports de
   `@workspace/database`: evita ciclo shared→database).
   ─────────────────────────────────────────────────────────────────────── */

/** Pago SaaS con lo necesario para componer (centavos enteros). */
export interface PlatformComposePayment {
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
  planSnapshotName?: string | null;
  planSnapshotCurrency: string;
  voided: boolean;
}

export interface PlatformComposeSubscription {
  startDate?: NullableDate;
  currentPeriodEnd?: NullableDate;
}

/** Organización receptora (columnas `organization`, todas NOT NULL). */
export interface PlatformComposeReceptor {
  name: string;
  legalName?: string | null;
  taxId?: string | null;
  countryCode: string;
  timezone: string;
}

/** Emisor FitStack (`platform_setting`, C1; todo opcional). */
export interface PlatformComposeEmitter {
  legalName?: string | null;
  taxId?: string | null;
  address?: string | null;
  countryCode?: string | null;
}

export interface PlatformComposeReceiptInput {
  receiptNumber: string;
  issuedAt: DateInput;
  payment: PlatformComposePayment;
  subscription: PlatformComposeSubscription | null;
  receptor: PlatformComposeReceptor;
  emitter: PlatformComposeEmitter;
}

/**
 * Arma `ReceiptData` SaaS desde filas crudas. Impuestos LEÍDOS del pago
 * (nunca recalculados); `type` siempre `'receipt'` (invoice bloqueado por
 * construcción, `HAS_FISCAL_HOMOLOGATION=false`). Lanza si faltan
 * impuestos persistidos o fechas inválidas.
 */
export function buildPlatformReceiptDataFromComposed(
  input: PlatformComposeReceiptInput,
): ReceiptData {
  const { payment, subscription, receptor, emitter } = input;

  if (payment.subtotal == null || payment.taxTotal == null) {
    throw new Error(
      'buildPlatformReceiptDataFromComposed: impuestos no persistidos en el pago (subtotal/tax_total ausentes).',
    );
  }
  const taxDetails = assertPersistedTaxDetails(
    payment.taxDetails,
    'buildPlatformReceiptDataFromComposed',
  );

  // Sin override de la org: FitStack define impuestos uniformes por país.
  const profile = resolveFiscalProfile(receptor.countryCode, undefined);
  const label = resolveDocumentLabel({
    taxId: emitter.taxId?.trim() || undefined,
    isFormalTaxpayer: false,
  });

  const masked = maskPaymentDetails(
    payment.paymentMethodDetails as
    | IPaymentMethodDetails
    | Record<string, unknown>
    | null
    | undefined,
  );
  const maskedDetails = toReceiptMaskedDetails(masked);

  const periodStart = subscription?.startDate ?? payment.paymentDate;
  const periodEnd = subscription?.currentPeriodEnd ?? periodStart;

  return {
    emitter: {
      name: emitter.legalName?.trim() || 'FitStack',
      legalName: emitter.legalName?.trim() || null,
      taxId: emitter.taxId?.trim() || null,
      taxLabel: profile.taxLabel,
      address: emitter.address?.trim() || null,
      countryCode: emitter.countryCode?.trim() || receptor.countryCode,
      currency: payment.planSnapshotCurrency,
    },
    recipient: {
      name: receptor.legalName?.trim() || receptor.name,
      documentId: receptor.taxId?.trim() || null,
      docLabel: profile.docLabel,
    },
    document: {
      number: input.receiptNumber,
      type: 'receipt',
      label,
      issuedAt: toIso(input.issuedAt),
    },
    sale: {
      planName: payment.planSnapshotName?.trim() || 'Plan de suscripción',
      periodStart: toIso(periodStart),
      periodEnd: toIso(periodEnd),
      paymentDate: toIso(payment.paymentDate),
    },
    amounts: {
      subtotal: payment.subtotal,
      taxDetails,
      taxTotal: payment.taxTotal,
      total: payment.amountPaid,
      currencyPaid: payment.currencyPaid,
      baseCurrency: payment.planSnapshotCurrency,
      exchangeRateApplied: payment.exchangeRateApplied ?? null,
    },
    method: {
      name: payment.paymentMethod,
      maskedDetails,
    },
    footer: {
      disclaimer: profile.disclaimer.includes('Emitido por FitStack')
        ? profile.disclaimer
        : [...profile.disclaimer, 'Emitido por FitStack'],
      generatedBy: 'Generado con FitStack',
    },
    timezone: receptor.timezone,
    voided: payment.voided,
    internalPaymentId: payment.id,
  };
}
