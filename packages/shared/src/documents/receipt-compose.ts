/* ── Documents / receipt-compose — pure ReceiptData builder ───────────────
   Converts raw rows (`getReceiptComposedData`) into the `ReceiptData`
   contract. Pure, no I/O, edge-safe: invoked by api-worker
   (`GET /:id/receipt`) and jobs-worker (`handleReceiptRender`) with the SAME
   result — neither app implements compose separately.
   Rules: taxes READ from payment (never recalculated), issuer frozen
   in snapshots, `paymentMethodDetails` masked, UUID only as
   `internalPaymentId`. Minimal structural interface (NO runtime import of
   `@workspace/database`: avoids circular shared→database dependency).
   ─────────────────────────────────────────────────────────────────────── */

import { resolveFiscalProfile, type FiscalProfile, type ResolvedTax } from './fiscal-profile';
import { resolveDocumentLabel } from './document-label-gate';
import { maskPaymentDetails } from './masking';
import { roundCents } from './tax-math';
import type { ITaxDetail, IPaymentMethodDetails } from '../types';
import { PAYMENT_STATUSES } from '../constants';
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

/** Payment row with fields necessary for composing (integer cents). */
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
  /**
   * Payment status. Together with `receiptVoided` it decides `voided` (RD-159):
   * the void writes `status = 'voided'` first and the flag second, so a lost
   * flag still means a voided document — and a voided document must never be
   * rendered without its stamp.
   */
  status?: string | null;
  /** Snapshot frozen upon payment registration (source of plan name). */
  planSnapshotName?: string | null;
  planSnapshotCurrency?: string | null;
  /** Plan price frozen at payment time, in the plan currency (integer cents). */
  planSnapshotPrice?: number | null;
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
   * Issuer identity frozen upon issuance. `null`/`undefined` = issuance
   * prior to snapshot: composed LIVE (documented terminal state).
   */
  emitterSnapshot?: unknown;
}

/**
 * Base currency equivalent total, in integer cents.
 *
 * The frozen plan price (the base-currency amount captured at payment time)
 * is the EXACT base total and always wins: converting back by dividing the
 * paid amount by the stored rate accumulates rounding, and a 4-decimal rate
 * used to lose up to ~20% on quotes like COP->USD.
 *
 * The division is the documented fallback for historical rows written before
 * the plan snapshot price was captured (`baseAmount` absent) and still needs a
 * valid rate. `null` when there is no conversion (same currency or absent
 * base currency): the document does not show an invented equivalent.
 */
function toBaseTotal(
  total: number,
  currencyPaid: string,
  baseCurrency: string | null | undefined,
  exchangeRateApplied: string | null | undefined,
  baseAmount?: number | null,
): number | null {
  if (!baseCurrency || baseCurrency === currencyPaid) return null;
  if (typeof baseAmount === 'number' && Number.isInteger(baseAmount) && baseAmount >= 0) {
    return baseAmount;
  }
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

/* ── Issuer Snapshot ──────────────────────────────────────────────────
   Freezes upon issuance what was previously derived from live rows.
   A persisted snapshot GOVERNS: if it exists, current configuration is
   not read (which is why `GET /:id/receipt` stays identical after profile edits).
   ─────────────────────────────────────────────────────────────────────── */

/** Auditable summary of applied fiscal profile. */
export function summarizeTaxes(taxes: ResolvedTax[]): ReceiptSnapshotTax[] {
  return taxes.map((t) => ({ name: t.name, rate: t.rate, enabled: t.enabled }));
}

/** Panel issuer identity (gym organization). */
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

/** Panel issuer snapshot (gym organization). */
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

/** Platform issuer identity (FitStack) from `platform_setting`. */
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
 * Generic FitStack issuer wording when the platform did not configure its own
 * fiscal country: no country regime is claimed (least of all the recipient's)
 * and the document stays non-fiscal.
 */
const GENERIC_PLATFORM_TAX_LABEL = 'Tax ID';
const GENERIC_PLATFORM_DISCLAIMER = [
  'Comprobante de pago interno. No constituye una factura fiscal.',
];

/**
 * Resolves the FitStack issuer fiscal profile from its OWN configured country
 * (`fitstack_country_code`). Empty = generic issuer (`null`): the fiscal label
 * and disclaimer are never borrowed from the recipient. Unknown country →
 * visible error, never a silent default.
 */
export function resolvePlatformEmitterProfile(
  emitter: PlatformComposeEmitter,
): FiscalProfile | null {
  const countryCode = emitter.countryCode?.trim();
  if (!countryCode) return null;
  return resolveFiscalProfile(countryCode);
}

/**
 * Platform issuer identity. The fiscal wording (`taxLabel`, `disclaimer`)
 * follows the ISSUER's profile; the recipient keeps its own label from ITS
 * profile (that is why both profiles are required). A `null` issuer profile is
 * a generic emitter, not the recipient's regime.
 */
function platformEmitterIdentity(
  input: {
    receptor: PlatformComposeReceptor;
    emitter: PlatformComposeEmitter;
    /** Base currency frozen in payment (`planSnapshotCurrency`). */
    currency: string;
  },
  emitterProfile: FiscalProfile | null,
  receptorProfile: FiscalProfile,
): Omit<ReceiptEmitterSnapshot, 'version' | 'taxes'> {
  const emitter: ReceiptEmitter = {
    name: input.emitter.legalName?.trim() || 'FitStack',
    legalName: input.emitter.legalName?.trim() || null,
    taxId: input.emitter.taxId?.trim() || null,
    // Fiscal label of the issuer's country; `Tax ID` when none is configured
    // (the line is printed only if a `taxId` exists).
    taxLabel: emitterProfile?.taxLabel ?? GENERIC_PLATFORM_TAX_LABEL,
    address: input.emitter.address?.trim() || null,
    // Informational only: with no configured issuer country it never decides
    // the fiscal wording (that stays generic). The contract keeps it non-empty.
    countryCode: input.emitter.countryCode?.trim() || input.receptor.countryCode,
    currency: input.currency,
  };
  const disclaimer = emitterProfile?.disclaimer ?? GENERIC_PLATFORM_DISCLAIMER;
  return {
    emitter,
    // FitStack is not declared formal taxpayer: gate enforces
    // 'Comprobante de pago' by construction, never 'Factura'.
    documentLabel: resolveDocumentLabel({
      taxId: emitter.taxId ?? undefined,
      isFormalTaxpayer: false,
    }),
    // B2B recipient (organization): the printed label is the country
    // `taxLabel` (`R.I.F.`, `NIT`), never the person-natural `docLabel`.
    recipientDocLabel: receptorProfile.taxLabel,
    disclaimer: disclaimer.includes('Emitido por FitStack')
      ? disclaimer
      : [...disclaimer, 'Emitido por FitStack'],
    timezone: input.receptor.timezone,
  };
}

/**
 * Platform issuer snapshot (FitStack). `emitterProfile` freezes the issuer's
 * fiscal wording; `receptorProfile` only provides the recipient label and the
 * tax breakdown (FitStack taxes, always disabled).
 */
export function buildPlatformEmitterSnapshot(
  input: {
    receptor: PlatformComposeReceptor;
    emitter: PlatformComposeEmitter;
    currency: string;
  },
  emitterProfile: FiscalProfile | null,
  receptorProfile: FiscalProfile,
): ReceiptEmitterSnapshot {
  return {
    version: 1,
    ...platformEmitterIdentity(input, emitterProfile, receptorProfile),
    taxes: summarizeTaxes(receptorProfile.taxes),
  };
}

/**
 * Reads persisted `emitter_snapshot` (jsonb). `null`/`undefined` returns
 * `null` (issuance prior to snapshot → caller composes live). A present
 * but invalid value THROWS: corrupt snapshot must not silently degrade to
 * today's config (it would cease being reproducible).
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
  /**
   * Base-currency amount (the frozen plan snapshot price). Exact; when
   * absent the assembly falls back to dividing by the persisted rate.
   */
  baseAmount?: number | null;
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
        payment.baseAmount,
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
 * Assembles `ReceiptData` from raw rows (Panel issuer: gym organization).
 * Validates persisted taxes and snapshot, resolves issuer differences
 * (recipient = member, period = subscription, base currency = plan/org snapshot,
 * `type` = document_type) and delegates assembling to core (`assembleReceiptData`).
 * Throws if persisted taxes are missing or invalid dates. Does NOT validate checklist
 * (caller handles with `checklistPrePdf`).
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

  // Snapshot first: if present, live configuration is NOT read (fiscal
  // profile is not even resolved) — issued document is reproducible.
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
      // The plan price IS the base amount (the server priced the charge from
      // it): never re-derive it by dividing the rounded rate. Guarded by
      // `planSnapshotCurrency`: without it the base falls back to the org
      // primary currency, where the plan price is not the base.
      baseAmount: payment.planSnapshotCurrency ? (payment.planSnapshotPrice ?? null) : null,
    },
    baseCurrency: payment.planSnapshotCurrency ?? organization.primaryCurrency,
    // RD-159: the payment STATUS is authoritative too. The flag can be lost
    // (void writes status first, flag second); deriving `voided` from the flag
    // alone would render an "…-anulado.pdf" WITHOUT the stamp, persist its key
    // and never regenerate it.
    voided:
      payment.receiptVoided === true ||
      payment.status === PAYMENT_STATUSES.VOIDED,
  });
}

/* ── SaaS receipt (Console) ────────────────────────────────────────
   Issuer = FitStack (`platform_setting` keys); recipient = org.
   Fiscal wording (label + disclaimer) follows the ISSUER's configured country;
   the recipient keeps its own label from its country. Taxes come from the
   recipient country WITHOUT override (the org does not decide its VAT) and
   stay disabled because FitStack is not a declared formal taxpayer. Unknown
   country → visible error; issuer without configured country → generic,
   non-fiscal wording (never the recipient's as a proxy).
   Pure, no I/O, edge-safe. Minimal structural interface (no imports of
   `@workspace/database`: avoids circular shared→database dependency).
   ─────────────────────────────────────────────────────────────────────── */

/** SaaS payment with fields necessary for composing (integer cents). */
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
  /** Plan price frozen at payment time, in that currency (integer cents). */
  planSnapshotPrice?: number | null;
  voided: boolean;
}

export interface PlatformComposeSubscription {
  startDate?: NullableDate;
  currentPeriodEnd?: NullableDate;
}

/** Recipient organization (`organization` columns, all NOT NULL). */
export interface PlatformComposeReceptor {
  name: string;
  legalName?: string | null;
  taxId?: string | null;
  /** Fiscal address; `null`/absent = the document omits the line. */
  address?: string | null;
  countryCode: string;
  timezone: string;
}

/** FitStack issuer (`platform_setting`; all optional). */
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
  /** Frozen identity upon issuance; `null` = prior issuance (live). */
  emitterSnapshot?: unknown;
}

/**
 * Assembles SaaS `ReceiptData` from raw rows (FitStack issuer, recipient org).
 * Taxes READ from payment (never recalculated); `type` always `'receipt'`
 * (invoice blocked by construction, `HAS_FISCAL_HOMOLOGATION=false`). Resolves
 * issuer differences (recipient = org, period = startDate/currentPeriodEnd,
 * base currency = plan snapshot) and delegates assembling to core (`assembleReceiptData`).
 * Throws if persisted taxes are missing or dates are invalid.
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

  // No org override: FitStack taxes come from the country profile.
  // Snapshot first: if present, live configuration is NOT read.
  const identity =
    assertEmitterSnapshot(input.emitterSnapshot, 'buildPlatformReceiptDataFromComposed') ??
    buildPlatformEmitterSnapshot(
      { receptor, emitter, currency: payment.planSnapshotCurrency },
      resolvePlatformEmitterProfile(emitter),
      resolveFiscalProfile(receptor.countryCode),
    );

  const periodStart = subscription?.startDate ?? payment.paymentDate;
  const periodEnd = subscription?.currentPeriodEnd ?? periodStart;

  return assembleReceiptData({
    method: 'buildPlatformReceiptDataFromComposed',
    identity,
    recipient: {
      // Structural B2B marker: the PDF renders organization wording, never
      // "Socio / Cliente" (person-natural), without text heuristics.
      kind: 'organization',
      name: receptor.legalName?.trim() || receptor.name,
      documentId: receptor.taxId?.trim() || null,
      docLabel: identity.recipientDocLabel,
      address: receptor.address?.trim() || null,
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
      // Same contract as the Panel composer: the frozen plan price IS the
      // base-currency amount. Guarded by `planSnapshotCurrency`, otherwise the
      // base currency would not match the currency the price is expressed in.
      baseAmount: payment.planSnapshotCurrency ? (payment.planSnapshotPrice ?? null) : null,
    },
    baseCurrency: payment.planSnapshotCurrency,
    voided: payment.voided,
  });
}
