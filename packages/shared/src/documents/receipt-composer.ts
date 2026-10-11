/* ── Documents / receipt-composer — the single payment → ReceiptData map ──
   One mapper per issuer. Both workers used to inline this mapping four
   times (jobs-worker step 2 render handlers, api-worker step 1 status
   reads); they now feed their composed Drizzle rows here and get the same
   `ReceiptData` the legacy inline mapping produced.

   Layer rule: this module MUST NOT import `@workspace/database` or any
   application. Drizzle rows are plain objects, so the input types below
   are STRUCTURAL — they declare only the fields the composer actually
   consumes, and any row exposing those fields (with narrower or equal
   types) is assignable. Pure, no I/O, edge-safe (Workers).
   ─────────────────────────────────────────────────────────────────────── */

import {
  buildPlatformReceiptDataFromComposed,
  buildReceiptDataFromComposed,
  platformEmitterFromSettings,
  type DateInput,
} from './receipt-compose';
import type { ReceiptData } from './receipt-data';

/* ── Structural row types (Panel issuer: the gym organization) ────────── */

/**
 * `payment` row as the composer consumes it. Cents fields accept `string`
 * too because the Neon HTTP driver may return bigints as strings; the
 * mapper normalizes with `Number()` exactly like the legacy call sites did.
 */
export interface PanelReceiptPaymentRow {
  id: number;
  amountPaid: number | string;
  currencyPaid: string;
  exchangeRateApplied?: string | null;
  paymentMethod: string;
  paymentMethodDetails?: unknown;
  paymentDate: DateInput;
  subtotal?: number | string | null;
  taxTotal?: number | string | null;
  taxDetails?: unknown;
  /** Correlative assigned by step 1; `null` = pre-system payment. */
  receiptNumber: string | null;
  documentType?: string | null;
  receiptIssuedAt?: DateInput | null;
  receiptVoided: boolean;
  /** Plan snapshot frozen at payment time (source of plan name/currency). */
  planSnapshotName?: string | null;
  planSnapshotCurrency?: string | null;
  /** Emitter identity frozen at issuance (C1); `null` = legacy, live compose. */
  emitterSnapshot?: unknown;
}

/** `organization` row fields the Panel compose consumes (the emitter). */
export interface PanelReceiptOrganizationRow {
  name: string;
  legalName?: string | null;
  taxId?: string | null;
  address?: string | null;
  countryCode: string;
  primaryCurrency: string;
  timezone?: string | null;
  fiscalConfig?: unknown;
}

/** `gym_member` row fields the compose consumes (the recipient). */
export interface PanelReceiptMemberRow {
  firstName?: string | null;
  lastName?: string | null;
  documentId?: string | null;
}

/** `subscription` row fields the compose consumes (the billed period). */
export interface PanelReceiptSubscriptionRow {
  startDate?: DateInput | null;
  endDate?: DateInput | null;
}

/** Structural twin of the repository's `ReceiptComposedData`. */
export interface PanelReceiptComposedRows {
  payment: PanelReceiptPaymentRow;
  organization: PanelReceiptOrganizationRow;
  member: PanelReceiptMemberRow | null;
  subscription: PanelReceiptSubscriptionRow | null;
}

/* ── Structural row types (Platform issuer: FitStack, SaaS) ───────────── */

/** `platform_subscription_payment` row as the composer consumes it. */
export interface PlatformReceiptPaymentRow {
  id: number;
  amountPaid: number | string;
  currencyPaid: string;
  exchangeRateApplied?: string | null;
  paymentMethod: string;
  paymentMethodDetails?: unknown;
  paymentDate: DateInput;
  subtotal?: number | string | null;
  taxTotal?: number | string | null;
  taxDetails?: unknown;
  /** Correlative `FS-N`; `null` = pre-system payment. */
  receiptNumber: string | null;
  receiptIssuedAt?: DateInput | null;
  receiptVoided: boolean;
  planSnapshotName?: string | null;
  /** Base currency frozen in the payment (always present in SaaS rows). */
  planSnapshotCurrency: string;
  emitterSnapshot?: unknown;
}

/** `platform_subscription` row fields the compose consumes. */
export interface PlatformReceiptSubscriptionRow {
  startDate?: DateInput | null;
  currentPeriodEnd?: DateInput | null;
}

/** Receptor `organization` row fields (all NOT NULL columns). */
export interface PlatformReceiptOrganizationRow {
  name: string;
  legalName?: string | null;
  taxId?: string | null;
  countryCode: string;
  timezone: string;
}

/** Structural twin of the repository's `PlatformReceiptComposedData`. */
export interface PlatformReceiptComposedRows {
  payment: PlatformReceiptPaymentRow;
  subscription: PlatformReceiptSubscriptionRow | null;
  organization: PlatformReceiptOrganizationRow;
  /** `platform_setting` rows keyed by `key` (FitStack emitter identity, C1). */
  emitter: Record<string, string>;
}

/* ── Panel mapper (issuer: the gym organization) ──────────────────────── */

/**
 * Maps composed rows to the Panel `ReceiptData`. Number and issue date are
 * read from the payment row itself (the persisted values, never a local
 * one). Throws if the row carries no receipt number: every caller gates on
 * `pre_system` before composing, so reaching here without a number means a
 * broken invariant (fail-closed, no invented number).
 */
export function composePanelReceipt(rows: PanelReceiptComposedRows): ReceiptData {
  const { payment, organization, member, subscription } = rows;
  const receiptNumber = payment.receiptNumber;
  if (!receiptNumber) {
    throw new TypeError(
      'composePanelReceipt: pago sin número persistido (invariante del caller rota).',
    );
  }
  return buildReceiptDataFromComposed({
    receiptNumber,
    documentType: payment.documentType === 'invoice' ? 'invoice' : 'receipt',
    // Defensive only: step 1 persists receipt_number and receipt_issued_at
    // in the same statement, and the jobs-worker render path re-checks the
    // invariant before calling. Preserves the legacy api-worker fallback.
    issuedAt: payment.receiptIssuedAt ?? new Date(),
    payment: {
      id: payment.id,
      amountPaid: Number(payment.amountPaid),
      currencyPaid: payment.currencyPaid,
      exchangeRateApplied: payment.exchangeRateApplied,
      paymentMethod: payment.paymentMethod,
      paymentMethodDetails: payment.paymentMethodDetails,
      paymentDate: payment.paymentDate,
      subtotal: payment.subtotal != null ? Number(payment.subtotal) : null,
      taxTotal: payment.taxTotal != null ? Number(payment.taxTotal) : null,
      taxDetails: payment.taxDetails,
      receiptNumber,
      receiptVoided: payment.receiptVoided,
      planSnapshotName: payment.planSnapshotName,
      planSnapshotCurrency: payment.planSnapshotCurrency,
    },
    organization: {
      name: organization.name,
      legalName: organization.legalName,
      taxId: organization.taxId,
      address: organization.address,
      countryCode: organization.countryCode,
      primaryCurrency: organization.primaryCurrency,
      timezone: organization.timezone,
      fiscalConfig: organization.fiscalConfig,
    },
    member: member
      ? {
          firstName: member.firstName,
          lastName: member.lastName,
          documentId: member.documentId,
        }
      : null,
    subscription: subscription
      ? {
          startDate: subscription.startDate,
          endDate: subscription.endDate,
        }
      : null,
    // C1: identity frozen at issuance (null = pre-snapshot, live compose).
    emitterSnapshot: payment.emitterSnapshot,
  });
}

/* ── Platform mapper (issuer: FitStack, SaaS) ─────────────────────────── */

/**
 * Maps composed rows to the SaaS `ReceiptData` (emitter FitStack, receptor
 * organization). Same contract as the Panel mapper: the persisted number is
 * authoritative and a missing one is a broken invariant, not a fallback.
 */
export function composePlatformReceipt(rows: PlatformReceiptComposedRows): ReceiptData {
  const { payment, subscription, organization, emitter } = rows;
  const receiptNumber = payment.receiptNumber;
  if (!receiptNumber) {
    throw new TypeError(
      'composePlatformReceipt: pago SaaS sin número persistido (invariante del caller rota).',
    );
  }
  return buildPlatformReceiptDataFromComposed({
    receiptNumber,
    // Defensive only, same rationale as the Panel mapper.
    issuedAt: payment.receiptIssuedAt ?? new Date(),
    payment: {
      id: payment.id,
      amountPaid: Number(payment.amountPaid),
      currencyPaid: payment.currencyPaid,
      exchangeRateApplied: payment.exchangeRateApplied,
      paymentMethod: payment.paymentMethod,
      paymentMethodDetails: payment.paymentMethodDetails,
      paymentDate: payment.paymentDate,
      subtotal: payment.subtotal != null ? Number(payment.subtotal) : null,
      taxTotal: payment.taxTotal != null ? Number(payment.taxTotal) : null,
      taxDetails: payment.taxDetails,
      planSnapshotName: payment.planSnapshotName,
      planSnapshotCurrency: payment.planSnapshotCurrency,
      voided: payment.receiptVoided,
    },
    subscription: subscription
      ? {
          startDate: subscription.startDate,
          currentPeriodEnd: subscription.currentPeriodEnd,
        }
      : null,
    receptor: {
      name: organization.name,
      legalName: organization.legalName,
      taxId: organization.taxId,
      countryCode: organization.countryCode,
      timezone: organization.timezone,
    },
    emitter: platformEmitterFromSettings(emitter),
    // C1: identity frozen at issuance (null = pre-snapshot, live compose).
    emitterSnapshot: payment.emitterSnapshot,
  });
}
