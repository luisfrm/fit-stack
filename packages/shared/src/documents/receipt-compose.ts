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

import { resolveFiscalProfile, type FiscalProfile, type ResolvedTax } from './fiscal-profile';
import { resolveDocumentLabel } from './document-label-gate';
import { maskPaymentDetails } from './masking';
import { roundCents } from './tax-math';
import type { ITaxDetail, IPaymentMethodDetails } from '../types';
import type {
  ReceiptData,
  ReceiptDocumentType,
  ReceiptEmitter,
  ReceiptEmitterSnapshot,
  ReceiptMethod,
  ReceiptRecipient,
  ReceiptSnapshotTax,
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
  /**
   * Identidad congelada al emitir (C1). `null`/`undefined` = emisión
   * anterior al snapshot: se compone EN VIVO (estado terminal documentado).
   */
  emitterSnapshot?: unknown;
}

/**
 * Equivalente del total en la moneda base, en centavos enteros. La tasa
 * persistida se lee "1 {base} = {rate} {pagada}", así que se divide.
 * `null` cuando no hay conversión (misma moneda o tasa ausente/inválida):
 * el documento no muestra un equivalente inventado.
 */
function toBaseTotal(
  total: number,
  currencyPaid: string,
  baseCurrency: string | null | undefined,
  exchangeRateApplied: string | null | undefined,
): number | null {
  if (!baseCurrency || baseCurrency === currencyPaid) return null;
  const rate = Number(exchangeRateApplied);
  if (!Number.isFinite(rate) || rate <= 0) return null;
  return roundCents(total / rate);
}

function toIso(value: DateInput, method: string): string {
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) {
    throw new TypeError(`${method}: fecha inválida (${String(value)}).`);
  }
  return d.toISOString();
}

/* ── Snapshot del emisor (C1) ──────────────────────────────────────────
   Congela al emitir lo que antes se derivaba de filas vivas. Un snapshot
   persistido MANDA: si existe no se lee la configuración actual (por eso
   `GET /:id/receipt` sigue siendo idéntico tras editar el perfil).
   ─────────────────────────────────────────────────────────────────────── */

/** Resumen auditable del perfil fiscal aplicado. */
export function summarizeTaxes(taxes: ResolvedTax[]): ReceiptSnapshotTax[] {
  return taxes.map((t) => ({ name: t.name, rate: t.rate, enabled: t.enabled }));
}

/** Identidad del emisor del Panel (la organización del gimnasio). */
function panelEmitterIdentity(
  organization: ComposeOrganization,
  profile: FiscalProfile,
): Omit<ReceiptEmitterSnapshot, 'version' | 'taxes'> {
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
    documentLabel: resolveDocumentLabel({
      taxId: organization.taxId,
      isFormalTaxpayer: profile.isFormalTaxpayer,
    }),
    recipientDocLabel: profile.docLabel,
    disclaimer: profile.disclaimer,
    timezone: organization.timezone ?? null,
  };
}

/** Snapshot del emisor del Panel (la organización del gimnasio). */
export function buildEmitterSnapshot(
  organization: ComposeOrganization,
  profile: FiscalProfile,
): ReceiptEmitterSnapshot {
  return {
    version: 1,
    ...panelEmitterIdentity(organization, profile),
    taxes: summarizeTaxes(profile.taxes),
  };
}

/** Identidad del emisor plataforma (FitStack) desde `platform_setting`. */
export function platformEmitterFromSettings(
  settings: Record<string, string>,
): PlatformComposeEmitter {
  return {
    legalName: settings['fitstack_legal_name'] || null,
    taxId: settings['fitstack_tax_id'] || null,
    address: settings['fitstack_address'] || null,
    countryCode: settings['fitstack_country_code'] || null,
  };
}

/**
 * Identidad del emisor plataforma: la de FitStack (settings) + el perfil
 * fiscal del país RECEPTOR (la org no decide su IVA). Sin país propio
 * configurado el emisor hereda el del receptor (proxy documentado, PENDING §8).
 */
function platformEmitterIdentity(
  input: {
    receptor: PlatformComposeReceptor;
    emitter: PlatformComposeEmitter;
    /** Moneda base congelada en el pago (`planSnapshotCurrency`). */
    currency: string;
  },
  profile: FiscalProfile,
): Omit<ReceiptEmitterSnapshot, 'version' | 'taxes'> {
  const emitter: ReceiptEmitter = {
    name: input.emitter.legalName?.trim() || 'FitStack',
    legalName: input.emitter.legalName?.trim() || null,
    taxId: input.emitter.taxId?.trim() || null,
    taxLabel: profile.taxLabel,
    address: input.emitter.address?.trim() || null,
    countryCode: input.emitter.countryCode?.trim() || input.receptor.countryCode,
    currency: input.currency,
  };
  return {
    emitter,
    // FitStack no está declarado contribuyente formal (C2): el gate aplica
    // 'Comprobante' por construcción, nunca 'Factura'.
    documentLabel: resolveDocumentLabel({
      taxId: emitter.taxId ?? undefined,
      isFormalTaxpayer: false,
    }),
    recipientDocLabel: profile.docLabel,
    disclaimer: profile.disclaimer.includes('Emitido por FitStack')
      ? profile.disclaimer
      : [...profile.disclaimer, 'Emitido por FitStack'],
    timezone: input.receptor.timezone,
  };
}

/** Snapshot del emisor plataforma (FitStack). */
export function buildPlatformEmitterSnapshot(
  input: {
    receptor: PlatformComposeReceptor;
    emitter: PlatformComposeEmitter;
    currency: string;
  },
  profile: FiscalProfile,
): ReceiptEmitterSnapshot {
  return {
    version: 1,
    ...platformEmitterIdentity(input, profile),
    taxes: summarizeTaxes(profile.taxes),
  };
}

/**
 * Lee un `emitter_snapshot` persistido (jsonb). `null`/`undefined` devuelve
 * `null` (emisión anterior al snapshot → el caller compone en vivo). Un valor
 * presente pero inválido LANZA: un snapshot corrupto no puede degradar en
 * silencio a la configuración de hoy (dejaría de ser reproducible).
 */
export function assertEmitterSnapshot(
  value: unknown,
  method: string,
): ReceiptEmitterSnapshot | null {
  if (value === null || value === undefined) return null;
  const v = value as Partial<ReceiptEmitterSnapshot>;
  const emitter = v.emitter as Partial<ReceiptEmitter> | undefined;
  const invalid =
    v.version !== 1 ||
    !emitter ||
    typeof emitter.name !== 'string' ||
    typeof emitter.taxLabel !== 'string' ||
    typeof emitter.countryCode !== 'string' ||
    typeof emitter.currency !== 'string' ||
    typeof v.documentLabel !== 'string' ||
    typeof v.recipientDocLabel !== 'string' ||
    !Array.isArray(v.disclaimer) ||
    v.disclaimer.some((line) => typeof line !== 'string') ||
    !Array.isArray(v.taxes) ||
    v.taxes.some(
      (t) =>
        typeof t?.name !== 'string' ||
        typeof t?.rate !== 'number' ||
        typeof t?.enabled !== 'boolean',
    );
  if (invalid) {
    throw new TypeError(
      `${method}: emitter_snapshot inválido (no se puede recomponer el comprobante emitido).`,
    );
  }
  return v as ReceiptEmitterSnapshot;
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

/**
 * Converts a detail field value to string safely, avoiding '[object Object]' for non-primitives.
 */
function toDetailString(value: unknown): string {
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  return '';
}

/**
 * Maps masked payment details to the `ReceiptMethod` contract.
 * Excludes `file` items (storage paths/attachments are internal and should not appear in receipt text/PDF).
 */
export function toReceiptMaskedDetails(masked: unknown): ReceiptMethod['maskedDetails'] {
  if (!Array.isArray(masked)) return undefined;
  const visible = (masked as { type?: unknown; label?: unknown; value?: unknown }[]).filter(
    (item) => item && typeof item === 'object' && item.type !== 'file',
  );
  if (visible.length === 0) return undefined;
  return visible.map((it) => ({
    label: toDetailString(it.label),
    value: toDetailString(it.value),
  }));
}

/* ── Assembly core (single, shared by every issuer) ─────────────────────
   The `document`, `amounts`, `method` and `footer` blocks are assembled
   ONCE here. The per-issuer builders resolve the differences (emitter
   identity, recipient, period, base currency, document type, voided flag)
   and delegate; they never re-assemble the contract themselves.
   Validation (persisted taxes, emitter snapshot) stays in the builders so
   the error precedence and messages of each public entry point are kept.
   ─────────────────────────────────────────────────────────────────────── */

/** Validated payment fields the assembly consumes (cents, taxes already read). */
export interface ReceiptAssemblyPayment {
  id: number;
  amountPaid: number;
  currencyPaid: string;
  exchangeRateApplied?: string | null;
  paymentMethod: string;
  paymentMethodDetails?: unknown;
  subtotal: number;
  taxTotal: number;
  taxDetails: ITaxDetail[];
}

/** Issuer differences, already resolved by the per-issuer mapper. */
export interface ReceiptAssemblyInput {
  /** Public entry point name, used in error messages. */
  method: string;
  identity: ReceiptEmitterSnapshot;
  recipient: ReceiptRecipient;
  document: {
    number: string;
    type: ReceiptDocumentType;
    issuedAt: DateInput;
  };
  sale: {
    planName: string;
    periodStart: DateInput;
    periodEnd: DateInput;
    paymentDate: DateInput;
  };
  payment: ReceiptAssemblyPayment;
  baseCurrency: string;
  voided: boolean;
}

/**
 * Assembles the `ReceiptData` contract from resolved issuer differences.
 * Pure: no I/O, no recalculation — taxes are the persisted lines, the base
 * total comes from the persisted rate, details are masked once here.
 */
export function assembleReceiptData(input: ReceiptAssemblyInput): ReceiptData {
  const { payment, identity } = input;

  const masked = maskPaymentDetails(
    payment.paymentMethodDetails as
      | IPaymentMethodDetails
      | Record<string, unknown>
      | null
      | undefined,
  );
  const maskedDetails = toReceiptMaskedDetails(masked);

  return {
    emitter: identity.emitter,
    recipient: input.recipient,
    document: {
      number: input.document.number,
      type: input.document.type,
      label: identity.documentLabel,
      issuedAt: toIso(input.document.issuedAt, input.method),
    },
    sale: {
      planName: input.sale.planName,
      periodStart: toIso(input.sale.periodStart, input.method),
      periodEnd: toIso(input.sale.periodEnd, input.method),
      paymentDate: toIso(input.sale.paymentDate, input.method),
    },
    amounts: {
      subtotal: payment.subtotal,
      taxDetails: payment.taxDetails,
      taxTotal: payment.taxTotal,
      total: payment.amountPaid,
      currencyPaid: payment.currencyPaid,
      baseCurrency: input.baseCurrency,
      exchangeRateApplied: payment.exchangeRateApplied ?? null,
      baseTotal: toBaseTotal(
        payment.amountPaid,
        payment.currencyPaid,
        input.baseCurrency,
        payment.exchangeRateApplied,
      ),
    },
    method: {
      name: payment.paymentMethod,
      maskedDetails,
    },
    footer: {
      disclaimer: identity.disclaimer,
      generatedBy: 'Generado con FitStack',
    },
    timezone: identity.timezone ?? undefined,
    voided: input.voided,
    internalPaymentId: payment.id,
  };
}

/**
 * Arma `ReceiptData` desde filas crudas (emisor Panel: la organización del
 * gimnasio). Valida impuestos persistidos y snapshot, resuelve las
 * diferencias del issuer (destinatario = miembro, período = suscripción,
 * moneda base = snapshot del plan u org, `type` = document_type) y delega
 * el ensamblaje al core único (`assembleReceiptData`). Lanza si faltan los
 * impuestos persistidos o fechas inválidas. NO valida el checklist (lo
 * hace el caller con `checklistPrePdf` y decide).
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

  // Snapshot primero: si existe, la configuración viva NO se lee (ni siquiera
  // se resuelve el perfil fiscal) — el documento emitido es reproducible.
  const identity =
    assertEmitterSnapshot(input.emitterSnapshot, 'buildReceiptDataFromComposed') ??
    buildEmitterSnapshot(
      organization,
      resolveFiscalProfile(organization.countryCode, organization.fiscalConfig),
    );

  const memberName = member
    ? `${member.firstName ?? ''} ${member.lastName ?? ''}`.trim() || 'Miembro'
    : 'Miembro';

  return assembleReceiptData({
    method: 'buildReceiptDataFromComposed',
    identity,
    recipient: {
      name: memberName,
      documentId: member?.documentId ?? null,
      docLabel: identity.recipientDocLabel,
    },
    document: {
      number: input.receiptNumber,
      type: input.documentType,
      issuedAt: input.issuedAt,
    },
    sale: {
      planName: payment.planSnapshotName?.trim() || 'Plan de membresía',
      periodStart: subscription?.startDate
        ? subscription.startDate
        : input.issuedAt,
      periodEnd: subscription?.endDate ? subscription.endDate : input.issuedAt,
      paymentDate: payment.paymentDate,
    },
    payment: {
      id: payment.id,
      amountPaid: payment.amountPaid,
      currencyPaid: payment.currencyPaid,
      exchangeRateApplied: payment.exchangeRateApplied,
      paymentMethod: payment.paymentMethod,
      paymentMethodDetails: payment.paymentMethodDetails,
      subtotal: payment.subtotal,
      taxTotal: payment.taxTotal,
      taxDetails,
    },
    baseCurrency: payment.planSnapshotCurrency ?? organization.primaryCurrency,
    voided: payment.receiptVoided ?? false,
  });
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
  /** Identidad congelada al emitir (C1); `null` = emisión previa (en vivo). */
  emitterSnapshot?: unknown;
}

/**
 * Arma `ReceiptData` SaaS desde filas crudas (emisor FitStack, receptor la
 * org). Impuestos LEÍDOS del pago (nunca recalculados); `type` siempre
 * `'receipt'` (invoice bloqueado por construcción,
 * `HAS_FISCAL_HOMOLOGATION=false`). Resuelve las diferencias del issuer
 * (destinatario = org, período = startDate/currentPeriodEnd, moneda base =
 * snapshot del plan) y delega el ensamblaje al core único
 * (`assembleReceiptData`). Lanza si faltan impuestos persistidos o fechas
 * inválidas.
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
  // Snapshot primero: si existe, la configuración viva NO se lee.
  const identity =
    assertEmitterSnapshot(input.emitterSnapshot, 'buildPlatformReceiptDataFromComposed') ??
    buildPlatformEmitterSnapshot(
      { receptor, emitter, currency: payment.planSnapshotCurrency },
      resolveFiscalProfile(receptor.countryCode),
    );

  const periodStart = subscription?.startDate ?? payment.paymentDate;
  const periodEnd = subscription?.currentPeriodEnd ?? periodStart;

  return assembleReceiptData({
    method: 'buildPlatformReceiptDataFromComposed',
    identity,
    recipient: {
      name: receptor.legalName?.trim() || receptor.name,
      documentId: receptor.taxId?.trim() || null,
      docLabel: identity.recipientDocLabel,
    },
    document: {
      number: input.receiptNumber,
      type: 'receipt',
      issuedAt: input.issuedAt,
    },
    sale: {
      planName: payment.planSnapshotName?.trim() || 'Plan de suscripción',
      periodStart,
      periodEnd,
      paymentDate: payment.paymentDate,
    },
    payment: {
      id: payment.id,
      amountPaid: payment.amountPaid,
      currencyPaid: payment.currencyPaid,
      exchangeRateApplied: payment.exchangeRateApplied,
      paymentMethod: payment.paymentMethod,
      paymentMethodDetails: payment.paymentMethodDetails,
      subtotal: payment.subtotal,
      taxTotal: payment.taxTotal,
      taxDetails,
    },
    baseCurrency: payment.planSnapshotCurrency,
    voided: payment.voided,
  });
}
