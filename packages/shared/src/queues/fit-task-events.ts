/* ── Queues / fit-task-events — task email queue contract ──────────────
   `fit-task-events` contract: the single task queue where the producers
   (api-worker + jobs-worker step 2) enqueue, and jobs-worker consumes.

   Types-ONLY (no I/O, edge-safe): imported by api-worker and jobs-worker
   from `@workspace/shared` — neither app imports types from the other.
   Every send site goes through a validated builder (fails fast with an
   explicit `throw`) and the consumer narrows `unknown` with
   `isFitTaskEvent`, so a rename can never fall silently into the consumer
   `default` branch (ack without error, no DLQ, no retry).
   ─────────────────────────────────────────────────────────────────────── */

export const REGISTRATION_INVITE_EVENT_TYPE = 'email.registration_invite' as const;
export const ORG_INVITE_EVENT_TYPE = 'email.org_invite' as const;
export const PAYMENT_RECEIPT_EVENT_TYPE = 'email.payment_receipt' as const;
export const ORG_PAYMENT_RECEIVED_EVENT_TYPE = 'email.org_payment_received' as const;

/** Staff registration invite (panel gym member or console platform staff). */
export interface RegistrationInviteEvent {
  type: typeof REGISTRATION_INVITE_EVENT_TYPE;
  email: string;
  token: string;
  /** Which app the registration link must point to. */
  target?: 'panel' | 'console';
  /** Platform role to assign on sign-up (console invites only). */
  role?: string;
}

/** Better Auth organization invitation email. */
export interface OrgInviteEvent {
  type: typeof ORG_INVITE_EVENT_TYPE;
  email: string;
  orgName: string;
  inviterName: string;
  inviteLink: string;
}

/** Gym membership payment receipt (panel issuer, step 2 of the render pipeline). */
export interface PaymentReceiptEvent {
  type: typeof PAYMENT_RECEIPT_EVENT_TYPE;
  paymentId: number;
  organizationId: string;
  /**
   * The persisted receipt number is the source of truth and is read from the
   * database by the consumer: it is intentionally NOT part of this contract.
   * In-flight events may still carry a legacy `receiptNumber` extra key —
   * consumers ignore it.
   */
}

/** SaaS subscription payment confirmation (platform issuer, step 2). */
export interface OrgPaymentReceivedEvent {
  type: typeof ORG_PAYMENT_RECEIVED_EVENT_TYPE;
  paymentId: number;
  organizationId: string;
  /** User who registered the payment (session). Receives confirmation + owners dedupe. */
  payerEmail?: string;
  payerName?: string;
}

export type FitTaskEvent =
  | RegistrationInviteEvent
  | OrgInviteEvent
  | PaymentReceiptEvent
  | OrgPaymentReceivedEvent;

/* ── Validated builders (every producer send site) ────────────────────── */

/** Minimal email shape gate: non-empty + `local@domain` (trim only for the check). */
const EMAIL_SHAPE = /^[^\s@]+@[^\s@]+$/;

function assertEmail(builder: string, email: string): void {
  if (!email || email.trim().length === 0) {
    throw new Error(`${builder}: email is required.`);
  }
  if (!EMAIL_SHAPE.test(email.trim())) {
    throw new Error(`${builder}: invalid email (${email}).`);
  }
}

function assertPaymentIdentity(builder: string, paymentId: number, organizationId: string): void {
  if (!Number.isInteger(paymentId) || paymentId < 1) {
    throw new Error(`${builder}: invalid paymentId (${String(paymentId)}).`);
  }
  if (!organizationId || organizationId.trim().length === 0) {
    throw new Error(`${builder}: organizationId is required.`);
  }
}

export interface BuildRegistrationInviteEventInput {
  email: string;
  token: string;
  /** Default `'panel'` (gym staff). `'console'` = platform staff invite. */
  target?: 'panel' | 'console';
  role?: string;
}

/**
 * Builds the validated event. Throws with an explicit message if invalid —
 * the producer fails fast, never silencing a broken invite.
 */
export function buildRegistrationInviteEvent(
  input: BuildRegistrationInviteEventInput,
): RegistrationInviteEvent {
  const builder = 'buildRegistrationInviteEvent';
  assertEmail(builder, input.email);
  if (!input.token || input.token.trim().length === 0) {
    throw new Error(`${builder}: token is required.`);
  }
  const target = input.target ?? 'panel';
  if (target !== 'panel' && target !== 'console') {
    throw new Error(`${builder}: invalid target (${String(input.target)}).`);
  }
  if (input.role !== undefined && typeof input.role !== 'string') {
    throw new Error(`${builder}: invalid role.`);
  }
  return {
    type: REGISTRATION_INVITE_EVENT_TYPE,
    email: input.email,
    token: input.token,
    target,
    ...(input.role !== undefined ? { role: input.role } : {}),
  };
}

export interface BuildOrgInviteEventInput {
  email: string;
  orgName: string;
  inviterName: string;
  inviteLink: string;
}

export function buildOrgInviteEvent(input: BuildOrgInviteEventInput): OrgInviteEvent {
  const builder = 'buildOrgInviteEvent';
  assertEmail(builder, input.email);
  if (!input.orgName || input.orgName.trim().length === 0) {
    throw new Error(`${builder}: orgName is required.`);
  }
  if (!input.inviterName || input.inviterName.trim().length === 0) {
    throw new Error(`${builder}: inviterName is required.`);
  }
  if (!input.inviteLink.startsWith('http://') && !input.inviteLink.startsWith('https://')) {
    throw new Error(`${builder}: invalid inviteLink (${input.inviteLink}).`);
  }
  return {
    type: ORG_INVITE_EVENT_TYPE,
    email: input.email,
    orgName: input.orgName,
    inviterName: input.inviterName,
    inviteLink: input.inviteLink,
  };
}

export interface BuildPaymentReceiptEventInput {
  paymentId: number;
  organizationId: string;
}

export function buildPaymentReceiptEvent(
  input: BuildPaymentReceiptEventInput,
): PaymentReceiptEvent {
  assertPaymentIdentity('buildPaymentReceiptEvent', input.paymentId, input.organizationId);
  return {
    type: PAYMENT_RECEIPT_EVENT_TYPE,
    paymentId: input.paymentId,
    organizationId: input.organizationId,
  };
}

export interface BuildOrgPaymentReceivedEventInput {
  paymentId: number;
  organizationId: string;
  /** Payer of the SaaS payment. Empty/absent = owners-only notification. */
  payerEmail?: string | null;
  payerName?: string | null;
}

/**
 * Builds the validated event. Payer semantics (business rule, not a silent
 * fallback): with no persisted payer email both payer fields are omitted and
 * the consumer notifies owners only; with one, the email is validated and
 * `payerName` defaults to `''`.
 */
export function buildOrgPaymentReceivedEvent(
  input: BuildOrgPaymentReceivedEventInput,
): OrgPaymentReceivedEvent {
  const builder = 'buildOrgPaymentReceivedEvent';
  assertPaymentIdentity(builder, input.paymentId, input.organizationId);
  const payerEmail = input.payerEmail ?? '';
  if (payerEmail.trim().length === 0) {
    // No persisted payer: owners-only notification, both payer fields omitted.
    return {
      type: ORG_PAYMENT_RECEIVED_EVENT_TYPE,
      paymentId: input.paymentId,
      organizationId: input.organizationId,
    };
  }
  assertEmail(builder, payerEmail);
  return {
    type: ORG_PAYMENT_RECEIVED_EVENT_TYPE,
    paymentId: input.paymentId,
    organizationId: input.organizationId,
    payerEmail,
    payerName: input.payerName?.trim() ?? '',
  };
}

/* ── Consumer guard ──────────────────────────────────────────────────── */

/**
 * Lax type-guard for the consumer (unknown → ack + error log, never retry).
 * Discriminates by `type` and checks the required fields of each variant.
 * Extra keys are tolerated on purpose (a legacy in-flight
 * `email.payment_receipt` may still carry `receiptNumber`).
 */
export function isFitTaskEvent(v: unknown): v is FitTaskEvent {
  if (typeof v !== 'object' || v === null) return false;
  const e = v as Record<string, unknown>;
  switch (e['type']) {
    case REGISTRATION_INVITE_EVENT_TYPE:
      return (
        typeof e['email'] === 'string' &&
        typeof e['token'] === 'string' &&
        (e['target'] === undefined || e['target'] === 'panel' || e['target'] === 'console') &&
        (e['role'] === undefined || typeof e['role'] === 'string')
      );
    case ORG_INVITE_EVENT_TYPE:
      return (
        typeof e['email'] === 'string' &&
        typeof e['orgName'] === 'string' &&
        typeof e['inviterName'] === 'string' &&
        typeof e['inviteLink'] === 'string'
      );
    case PAYMENT_RECEIPT_EVENT_TYPE:
      return typeof e['paymentId'] === 'number' && typeof e['organizationId'] === 'string';
    case ORG_PAYMENT_RECEIVED_EVENT_TYPE:
      return (
        typeof e['paymentId'] === 'number' &&
        typeof e['organizationId'] === 'string' &&
        (e['payerEmail'] === undefined || typeof e['payerEmail'] === 'string') &&
        (e['payerName'] === undefined || typeof e['payerName'] === 'string')
      );
    default:
      return false;
  }
}
