/* ── Receipts repository (SHARED) ────────────────────────────────────────
   Conscious exception to AGENTS.md §1: all receipt data access
   (reading and writing) lives here because TWO runtimes (api-worker step 1 +
   endpoints, jobs-worker step 2 + sweep) require IDENTICAL
   implementations — the atomic statement and WHERE conditions are the core
   guarantee against duplicates. No other repo is moved (see AGENTS.md).
   Pure factory: receives `Db` parameter (per-request, without process.env).
   ─────────────────────────────────────────────────────────────────────── */

import { and, eq, isNotNull, isNull, sql } from 'drizzle-orm';
import type { Db } from '../factory';
import {
  gymMember,
  organization,
  organizationDocumentSequence,
  payment,
  subscription,
} from '../schema';
import {
  MAX_RECEIPT_YEAR,
  MIN_RECEIPT_YEAR,
  isValidPanelReceiptNumber,
  type ReceiptDocumentType,
  type ReceiptEmitterSnapshot,
} from '@workspace/shared';

/** Row of `payment` as returned by Drizzle (source of type, no cross-imports). */
export type DbPayment = typeof payment.$inferSelect;
export type DbOrganization = typeof organization.$inferSelect;
export type DbGymMember = typeof gymMember.$inferSelect;
export type DbSubscription = typeof subscription.$inferSelect;

/** Raw rows for `buildReceiptDataFromComposed` (shared, pure). */
export interface ReceiptComposedData {
  payment: DbPayment;
  organization: DbOrganization;
  member: DbGymMember | null;
  subscription: DbSubscription | null;
}

/**
 * Claim payload: everything persisted BEFORE the number is consumed, so the
 * fiscal work never burns a correlative and the sweep can resume the claim.
 */
export interface ClaimReceiptInput {
  /** Integer cents. */
  subtotal: number;
  taxTotal: number;
  taxDetails: unknown;
  /** Emitter identity frozen upon issuance. */
  emitterSnapshot: ReceiptEmitterSnapshot | null;
  /** Issuing actor. Missing during sweep: remains `null`, never fabricated. */
  issuedBy: string | null;
}

/** Number payload: only the correlative and its issuance instant. */
export interface AttachReceiptNumberInput {
  receiptNumber: string;
  documentType: ReceiptDocumentType;
  receiptIssuedAt: Date;
}

export interface MarkVoidedInput {
  /** Voiding actor (user.id). */
  by: string;
  /** Non-empty reason (audit log). */
  reason: string;
}

function assertOrgId(orgId: string, method: string): void {
  if (!orgId || orgId.trim().length === 0) {
    throw new Error(`${method}: orgId is required (strict isolation).`);
  }
}

function assertDocumentType(type: ReceiptDocumentType, method: string): void {
  if (type !== 'receipt' && type !== 'invoice') {
    throw new Error(`${method}: invalid document_type (${String(type)}).`);
  }
}

function assertYear(year: number, method: string): void {
  if (!Number.isInteger(year) || year < MIN_RECEIPT_YEAR || year > MAX_RECEIPT_YEAR) {
    throw new Error(
      `${method}: invalid year (${String(year)}). Allowed range ${MIN_RECEIPT_YEAR}-${MAX_RECEIPT_YEAR}.`,
    );
  }
}

export function createReceiptsRepository(db: Db) {
  return {
    /**
     * Allocates the next correlative number with a SINGLE atomic statement
     * (INSERT ... ON CONFLICT DO UPDATE ... RETURNING). Without interactive
     * transactions (Neon HTTP driver), without SELECT FOR UPDATE. Covers
     * race condition on first receipt of the year/emitter without prior row.
     * Never rolls back an allocated number.
     */
    async nextDocumentNumber(
      orgId: string,
      type: ReceiptDocumentType,
      year: number,
    ): Promise<number> {
      assertOrgId(orgId, 'nextDocumentNumber');
      assertDocumentType(type, 'nextDocumentNumber');
      assertYear(year, 'nextDocumentNumber');

      const [row] = await db
        .insert(organizationDocumentSequence)
        .values({ organizationId: orgId, documentType: type, year, lastNumber: 1 })
        .onConflictDoUpdate({
          target: [
            organizationDocumentSequence.organizationId,
            organizationDocumentSequence.documentType,
            organizationDocumentSequence.year,
          ],
          set: { lastNumber: sql`${organizationDocumentSequence.lastNumber} + 1` },
        })
        .returning({ lastNumber: organizationDocumentSequence.lastNumber });
      // INSERT ... RETURNING always returns a row (created or updated).
      // No silent fallback: fabricating 1 would duplicate correlative numbers.
      if (!row) {
        throw new Error('nextDocumentNumber: INSERT ... RETURNING no devolvió fila.');
      }
      return row.lastNumber;
    },

    /**
     * Correlative compensation: returns the last number consumed by
     * this execution when it LOST the race in `attachReceiptNumber` (another
     * concurrent execution already numbered the payment, so local number was
     * not persisted).
     *
     * Only reverts if we are still the latest consumer
     * (`last_number = seq`): if another execution consumed after, decrementing the
     * counter would reassign a live number — prohibited. In that case
     * returns `released: false` and the number remains as an audited gap.
     */
    async releaseLastNumber(
      orgId: string,
      type: ReceiptDocumentType,
      year: number,
      seq: number,
    ): Promise<{ released: boolean }> {
      assertOrgId(orgId, 'releaseLastNumber');
      assertDocumentType(type, 'releaseLastNumber');
      assertYear(year, 'releaseLastNumber');
      if (!Number.isInteger(seq) || seq < 1) {
        throw new Error(`releaseLastNumber: invalid seq (${String(seq)}).`);
      }

      const [row] = await db
        .update(organizationDocumentSequence)
        .set({ lastNumber: sql`${organizationDocumentSequence.lastNumber} - 1` })
        .where(
          and(
            eq(organizationDocumentSequence.organizationId, orgId),
            eq(organizationDocumentSequence.documentType, type),
            eq(organizationDocumentSequence.year, year),
            eq(organizationDocumentSequence.lastNumber, seq),
          ),
        )
        .returning({ lastNumber: organizationDocumentSequence.lastNumber });
      return { released: row !== undefined };
    },

    /**
     * Claims the payment BEFORE consuming the sequence: persists the fiscal
     * breakdown, the frozen emitter snapshot and the actor in a SINGLE
     * statement guarded by `receipt_claim_at IS NULL`.
     *
     * `claimed: false` means another emission won the claim (or the payment
     * is no longer `validated`): the caller re-reads the row and never consumes
     * a number. The claim is never released: a stale one is resumed by the
     * sweep with the SAME row, so no number can be burned by a slow emission.
     */
    async claimReceipt(
      paymentId: number,
      orgId: string,
      input: ClaimReceiptInput,
    ): Promise<{ claimed: boolean }> {
      assertOrgId(orgId, 'claimReceipt');

      const [row] = await db
        .update(payment)
        .set({
          receiptClaimAt: sql`now()`,
          subtotal: input.subtotal,
          taxTotal: input.taxTotal,
          taxDetails: input.taxDetails ?? null,
          // Frozen identity + actor: persisted with the claim so a resumed
          // issuance reproduces the same document.
          emitterSnapshot: input.emitterSnapshot,
          issuedBy: input.issuedBy,
        })
        .where(
          and(
            eq(payment.id, paymentId),
            eq(payment.organizationId, orgId),
            eq(payment.status, 'validated'),
            isNull(payment.receiptNumber),
            isNull(payment.receiptClaimAt),
          ),
        )
        .returning({ id: payment.id });
      return { claimed: row !== undefined };
    },

    /**
     * Numbers an ALREADY CLAIMED payment (`receipt_claim_at IS NOT NULL`).
     * Never renumbers: with a number present the statement matches nothing and
     * the existing row is returned. If the claim is gone the row is also
     * returned (caller decides; nothing is written).
     *
     * `status = 'validated'` is part of the WHERE on purpose: the sweep reads
     * the claim and only later attaches, so the payment may have been voided in
     * between. Numbering it would create a voided document without its sealed
     * ANULADO artifact. The row comes back WITHOUT `receipt_number` and the
     * caller releases the local correlative (fail-closed).
     */
    async attachReceiptNumber(
      paymentId: number,
      orgId: string,
      input: AttachReceiptNumberInput,
    ): Promise<DbPayment> {
      assertOrgId(orgId, 'attachReceiptNumber');
      assertDocumentType(input.documentType, 'attachReceiptNumber');
      if (!isValidPanelReceiptNumber(input.receiptNumber)) {
        throw new Error(
          `attachReceiptNumber: receipt_number con formato inválido (${input.receiptNumber}).`,
        );
      }

      const [updated] = await db
        .update(payment)
        .set({
          receiptNumber: input.receiptNumber,
          documentType: input.documentType,
          receiptIssuedAt: input.receiptIssuedAt,
        })
        .where(
          and(
            eq(payment.id, paymentId),
            eq(payment.organizationId, orgId),
            eq(payment.status, 'validated'),
            isNull(payment.receiptNumber),
            isNotNull(payment.receiptClaimAt),
          ),
        )
        .returning();
      if (updated) return updated;

      const [existing] = await db
        .select()
        .from(payment)
        .where(and(eq(payment.id, paymentId), eq(payment.organizationId, orgId)));
      if (!existing) {
        throw new Error(
          `attachReceiptNumber: pago ${paymentId} no encontrado en la organización.`,
        );
      }
      return existing;
    },

    /**
     * Marks a receipt as VOIDED. Preserves number and PDF;
     * never releases or reuses the number (frozen decision).
     *
     * Idempotent at the STORAGE layer too (`receipt_voided = false` in the
     * WHERE): a second delivery returns the row without rewriting the audit
     * trail (`voided_by` / `voided_at` / `void_reason`). The service also
     * short-circuits, this is the backstop for concurrent deliveries.
     */
    async markVoided(
      paymentId: number,
      orgId: string,
      input: MarkVoidedInput,
    ): Promise<DbPayment> {
      assertOrgId(orgId, 'markVoided');
      if (!input.by || input.by.trim().length === 0) {
        throw new Error('markVoided: by (actor) is required.');
      }
      if (!input.reason || input.reason.trim().length === 0) {
        throw new Error('markVoided: reason no vacío es obligatorio.');
      }

      const [row] = await db
        .update(payment)
        .set({
          receiptVoided: true,
          voidedBy: input.by,
          voidedAt: new Date(),
          voidReason: input.reason,
        })
        .where(
          and(
            eq(payment.id, paymentId),
            eq(payment.organizationId, orgId),
            eq(payment.receiptVoided, false),
          ),
        )
        .returning();
      if (row) return row;

      // Already voided → return the stored row untouched (audit preserved).
      const [existing] = await db
        .select()
        .from(payment)
        .where(and(eq(payment.id, paymentId), eq(payment.organizationId, orgId)));
      if (!existing) {
        throw new Error(`markVoided: pago ${paymentId} no encontrado en la organización.`);
      }
      return existing;
    },

    /**
     * Repairs the void whose second write was lost. The void flow writes
     * `status = 'voided'` FIRST and `markVoided` second: if the second write
     * fails, the payment is voided with `receipt_voided = false`, so the sweep
     * never sees it (it looks for the flag SET) and the ORIGINAL PDF keeps
     * being served. This statement flips ONLY the flag: the audit
     * (`voided_by` / `voided_at` / `void_reason`) is preserved verbatim — the
     * sweep cannot invent an actor.
     *
     * `flagged: true` = THIS call flipped it (the caller owns the render);
     * `false` = not repairable (no number, not voided) or another run won.
     */
    async flagVoidedIfMissing(
      paymentId: number,
      orgId: string,
    ): Promise<{ flagged: boolean }> {
      assertOrgId(orgId, 'flagVoidedIfMissing');
      const [row] = await db
        .update(payment)
        .set({ receiptVoided: true })
        .where(
          and(
            eq(payment.id, paymentId),
            eq(payment.organizationId, orgId),
            eq(payment.status, 'voided'),
            isNotNull(payment.receiptNumber),
            eq(payment.receiptVoided, false),
          ),
        )
        .returning({ id: payment.id });
      return { flagged: row !== undefined };
    },

    /** Finds a payment by human correlative number (org-scoped). */
    async findByReceiptNumber(
      orgId: string,
      receiptNumber: string,
    ): Promise<DbPayment | undefined> {
      assertOrgId(orgId, 'findByReceiptNumber');
      const [row] = await db
        .select()
        .from(payment)
        .where(
          and(eq(payment.organizationId, orgId), eq(payment.receiptNumber, receiptNumber)),
        );
      return row;
    },

    /**
     * Loads raw rows to compose `ReceiptData`
     * (`buildReceiptDataFromComposed`, shared pure). 4 simple sequential selects,
     * all org-scoped. Read-only: does not calculate taxes, does not resolve gates,
     * does not mask. Returns `undefined` if payment does not belong to org
     * (caller maps to 404).
     */
    async getReceiptComposedData(
      orgId: string,
      paymentId: number,
    ): Promise<ReceiptComposedData | undefined> {
      assertOrgId(orgId, 'getReceiptComposedData');
      const [pay] = await db
        .select()
        .from(payment)
        .where(and(eq(payment.id, paymentId), eq(payment.organizationId, orgId)));
      if (!pay) return undefined;

      const [org] = await db
        .select()
        .from(organization)
        .where(eq(organization.id, orgId));
      if (!org) return undefined;

      const [mem] = await db
        .select()
        .from(gymMember)
        .where(
          and(eq(gymMember.id, pay.memberId), eq(gymMember.organizationId, orgId)),
        );

      let sub: DbSubscription | null = null;
      if (pay.subscriptionId != null) {
        const [s] = await db
          .select()
          .from(subscription)
          .where(
            and(
              eq(subscription.id, pay.subscriptionId),
              eq(subscription.organizationId, orgId),
            ),
          );
        sub = s ?? null;
      }
      return { payment: pay, organization: org, member: mem ?? null, subscription: sub };
    },

    /**
     * Completes PDF: sets `receipt_pdf_key` ONLY if not already present
     * (`WHERE receipt_pdf_key IS NULL RETURNING`). Email gate:
     * `completed === true` indicates THIS delivery completed the PDF
     * (enqueue email); `false` = another delivery already did (silent,
     * no second email). Never use `attachReceiptNumber` as gate.
     */
    async completeReceiptPdf(
      paymentId: number,
      orgId: string,
      key: string,
    ): Promise<{ completed: boolean }> {
      assertOrgId(orgId, 'completeReceiptPdf');
      if (!key || key.trim().length === 0) {
        throw new Error('completeReceiptPdf: key es obligatoria.');
      }
      const [row] = await db
        .update(payment)
        .set({ receiptPdfKey: key })
        .where(
          and(
            eq(payment.id, paymentId),
            eq(payment.organizationId, orgId),
            isNull(payment.receiptPdfKey),
          ),
        )
        .returning({ id: payment.id });
      return { completed: row !== undefined };
    },

    /**
     * Completes VOIDED PDF: sets `receipt_voided_pdf_key` ONLY if not
     * already present. Symmetric gate to `completeReceiptPdf`, but with no
     * effect on email: voiding never notifies (valid receipt was already sent)
     * and `receipt_notified_at` is untouched.
     *
     * Original (`receipt_pdf_key`) remains intact: voiding creates a
     * NEW artifact, never overwriting the issued one.
     */
    async completeVoidedReceiptPdf(
      paymentId: number,
      orgId: string,
      key: string,
    ): Promise<{ completed: boolean }> {
      assertOrgId(orgId, 'completeVoidedReceiptPdf');
      if (!key || key.trim().length === 0) {
        throw new Error('completeVoidedReceiptPdf: key es obligatoria.');
      }
      const [row] = await db
        .update(payment)
        .set({ receiptVoidedPdfKey: key })
        .where(
          and(
            eq(payment.id, paymentId),
            eq(payment.organizationId, orgId),
            isNull(payment.receiptVoidedPdfKey),
          ),
        )
        .returning({ id: payment.id });
      return { completed: row !== undefined };
    },

    /**
     * Marks email notification as delivered. Anti-loss gate: retries
     * check `receipt_notified_at` to avoid resending, and if delivery
     * fails the caller resets the flag and retries.
     */
    async markReceiptNotified(
      paymentId: number,
      orgId: string,
    ): Promise<{ completed: boolean }> {
      assertOrgId(orgId, 'markReceiptNotified');
      const [row] = await db
        .update(payment)
        .set({ receiptNotifiedAt: new Date() })
        .where(
          and(
            eq(payment.id, paymentId),
            eq(payment.organizationId, orgId),
            isNull(payment.receiptNotifiedAt),
          ),
        )
        .returning({ id: payment.id });
      return { completed: row !== undefined };
    },

    /** Resets notification flag (best-effort) if delivery failed. */
    async clearReceiptNotified(paymentId: number, orgId: string): Promise<void> {
      assertOrgId(orgId, 'clearReceiptNotified');
      await db
        .update(payment)
        .set({ receiptNotifiedAt: null })
        .where(
          and(eq(payment.id, paymentId), eq(payment.organizationId, orgId)),
        );
    },
  };
}

export type ReceiptsRepository = ReturnType<typeof createReceiptsRepository>;
