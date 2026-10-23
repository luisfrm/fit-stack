/* ── Platform receipts repository (SHARED) ───────────────────────────────
   Conscious exception to AGENTS.md §1: all SaaS receipt data access
   lives here because TWO runtimes (api-worker step 1, jobs-worker step 2
   + sweep) require IDENTICAL implementations — the atomic statement and
   WHERE conditions are the core guarantee against duplicates.
   Moved from api-worker (precedent: the earlier platform-emission work, `77a7d8b`).
   Pure factory: receives `Db` parameter (per-request, without process.env).
   ─────────────────────────────────────────────────────────────────────── */

import { and, eq, isNotNull, isNull, sql, type Db } from '../factory';
import {
  organization,
  platformDocumentSequence,
  platformSetting,
  platformSubscription,
  platformSubscriptionPayment,
} from '../schema';
import {
  isValidConsoleReceiptNumber,
  type ReceiptDocumentType,
  type ReceiptEmitterSnapshot,
} from '@workspace/shared';

/** Rows as returned by Drizzle (source of types). */
export type DbPlatformPayment = typeof platformSubscriptionPayment.$inferSelect;
export type DbPlatformSubscription = typeof platformSubscription.$inferSelect;
export type DbPlatformOrganization = typeof organization.$inferSelect;

/** Raw data for SaaS receipt compose (shared, pure). */
export interface PlatformReceiptComposedData {
  payment: DbPlatformPayment;
  subscription: DbPlatformSubscription | null;
  organization: DbPlatformOrganization;
  /** Full `platform_setting` map (FitStack emitter keys). */
  emitter: Record<string, string>;
}

export interface ClaimPlatformReceiptInput {
  /** Integer cents. */
  subtotal: number;
  taxTotal: number;
  taxDetails: unknown;
  /** Emitter identity (FitStack) frozen upon issuance. */
  emitterSnapshot: ReceiptEmitterSnapshot | null;
  /** Issuing actor. Missing during sweep: remains `null`. */
  issuedBy: string | null;
}

/** Number payload: only the global correlative and its issuance instant. */
export interface AttachPlatformReceiptNumberInput {
  /** `FS-0000001` (Console format, validated). */
  receiptNumber: string;
  receiptIssuedAt: Date;
}

export interface MarkPlatformVoidedInput {
  /** Voiding actor (user.id). */
  by: string;
  /** Non-empty reason (audit log). */
  reason: string;
}

function assertPaymentId(paymentId: number, method: string): void {
  if (!Number.isInteger(paymentId) || paymentId < 1) {
    throw new Error(`${method}: invalid paymentId (${String(paymentId)}).`);
  }
}

function assertDocumentType(type: ReceiptDocumentType, method: string): void {
  if (type !== 'receipt' && type !== 'invoice') {
    throw new Error(`${method}: document_type inválido (${String(type)}). Sin pgEnum.`);
  }
}

export function createPlatformReceiptsRepository(db: Db) {
  return {
    /**
     * Next global sequence number with a SINGLE atomic statement
     * (INSERT ... ON CONFLICT DO UPDATE ... RETURNING). Without interactive
     * transactions (Neon HTTP driver), without SELECT FOR UPDATE. Covers
     * race condition on first receipt without prior row. Never rolls back.
     */
    async nextPlatformDocumentNumber(type: ReceiptDocumentType): Promise<number> {
      assertDocumentType(type, 'nextPlatformDocumentNumber');

      const [row] = await db
        .insert(platformDocumentSequence)
        .values({ documentType: type, lastNumber: 1 })
        .onConflictDoUpdate({
          target: [platformDocumentSequence.documentType],
          set: { lastNumber: sql`${platformDocumentSequence.lastNumber} + 1` },
        })
        .returning({ lastNumber: platformDocumentSequence.lastNumber });
      // INSERT ... RETURNING always returns a row (created or updated).
      // No silent fallback: fabricating 1 would duplicate correlative numbers.
      if (!row) {
        throw new Error('nextPlatformDocumentNumber: INSERT ... RETURNING no devolvió fila.');
      }
      return row.lastNumber;
    },

    /**
     * Global correlative compensation: rolls back the last number
     * consumed by this execution when it LOST the race in
     * `attachPlatformReceiptNumber` (another execution already numbered the payment).
     *
     * Only reverts if we are still the latest consumer
     * (`last_number = seq`): decrementing with newer consumers would
     * reassign a live number — prohibited. Otherwise `released: false`
     * and the number remains as an audited gap.
     */
    async releaseLastPlatformNumber(
      type: ReceiptDocumentType,
      seq: number,
    ): Promise<{ released: boolean }> {
      assertDocumentType(type, 'releaseLastPlatformNumber');
      if (!Number.isInteger(seq) || seq < 1) {
        throw new Error(`releaseLastPlatformNumber: invalid seq (${String(seq)}).`);
      }

      const [row] = await db
        .update(platformDocumentSequence)
        .set({ lastNumber: sql`${platformDocumentSequence.lastNumber} - 1` })
        .where(
          and(
            eq(platformDocumentSequence.documentType, type),
            eq(platformDocumentSequence.lastNumber, seq),
          ),
        )
        .returning({ lastNumber: platformDocumentSequence.lastNumber });
      return { released: row !== undefined };
    },

    /**
     * Global sequence status + issued numbers in the universe, for Console
     * gap audits. Mirrors `payments.repository.getReceiptSequenceState` (Panel)
     * without year or org: `FS-N` is a single continuous sequence.
     */
    async getPlatformReceiptSequenceState(type: ReceiptDocumentType): Promise<{
      lastNumber: number;
      numbers: Array<{
        receiptNumber: string | null;
        receiptVoided: boolean;
        voidedBy: string | null;
        voidedAt: Date | null;
        voidReason: string | null;
      }>;
    }> {
      assertDocumentType(type, 'getPlatformReceiptSequenceState');

      const [seq] = await db
        .select({ lastNumber: platformDocumentSequence.lastNumber })
        .from(platformDocumentSequence)
        .where(eq(platformDocumentSequence.documentType, type));

      const numbers = await db
        .select({
          receiptNumber: platformSubscriptionPayment.receiptNumber,
          receiptVoided: platformSubscriptionPayment.receiptVoided,
          voidedBy: platformSubscriptionPayment.voidedBy,
          voidedAt: platformSubscriptionPayment.voidedAt,
          voidReason: platformSubscriptionPayment.voidReason,
        })
        .from(platformSubscriptionPayment)
        .where(isNotNull(platformSubscriptionPayment.receiptNumber));

      return { lastNumber: seq?.lastNumber ?? 0, numbers };
    },

    /**
     * Claims the SaaS payment BEFORE consuming the global sequence: persists
     * the fiscal breakdown, the frozen FitStack snapshot and the actor in a
     * SINGLE statement guarded by `receipt_claim_at IS NULL`.
     *
     * `claimed: false` means another emission won the claim (or the payment is
     * no longer `validated`): the caller re-reads the row and never consumes a
     * number. The claim is never released: a stale one is resumed by the sweep.
     */
    async claimPlatformReceipt(
      paymentId: number,
      input: ClaimPlatformReceiptInput,
    ): Promise<{ claimed: boolean }> {
      assertPaymentId(paymentId, 'claimPlatformReceipt');

      const [row] = await db
        .update(platformSubscriptionPayment)
        .set({
          receiptClaimAt: sql`now()`,
          subtotal: input.subtotal,
          taxTotal: input.taxTotal,
          taxDetails: input.taxDetails ?? null,
          // Frozen identity + actor, persisted with the claim.
          emitterSnapshot: input.emitterSnapshot,
          issuedBy: input.issuedBy,
        })
        .where(
          and(
            eq(platformSubscriptionPayment.id, paymentId),
            eq(platformSubscriptionPayment.status, 'validated'),
            isNull(platformSubscriptionPayment.receiptNumber),
            isNull(platformSubscriptionPayment.receiptClaimAt),
          ),
        )
        .returning({ id: platformSubscriptionPayment.id });
      return { claimed: row !== undefined };
    },

    /**
     * Numbers an ALREADY CLAIMED SaaS payment. Never renumbers: with a number
     * present the statement matches nothing and the existing row is returned.
     *
     * `status = 'validated'` is part of the WHERE on purpose (Panel mirror):
     * the sweep reads the claim and only later attaches, so the payment may
     * have been voided in between. The row comes back WITHOUT
     * `receipt_number` and the caller releases the local correlative.
     */
    async attachPlatformReceiptNumber(
      paymentId: number,
      input: AttachPlatformReceiptNumberInput,
    ): Promise<DbPlatformPayment> {
      assertPaymentId(paymentId, 'attachPlatformReceiptNumber');
      if (typeof input.receiptNumber !== 'string' || !isValidConsoleReceiptNumber(input.receiptNumber)) {
        throw new Error(
          `attachPlatformReceiptNumber: receipt_number con formato inválido (${String(input.receiptNumber)}).`,
        );
      }

      const [updated] = await db
        .update(platformSubscriptionPayment)
        .set({
          receiptNumber: input.receiptNumber,
          receiptIssuedAt: input.receiptIssuedAt,
        })
        .where(
          and(
            eq(platformSubscriptionPayment.id, paymentId),
            eq(platformSubscriptionPayment.status, 'validated'),
            isNull(platformSubscriptionPayment.receiptNumber),
            isNotNull(platformSubscriptionPayment.receiptClaimAt),
          ),
        )
        .returning();

      if (updated) return updated;

      const [existing] = await db
        .select()
        .from(platformSubscriptionPayment)
        .where(eq(platformSubscriptionPayment.id, paymentId));
      if (!existing) {
        throw new Error(`attachPlatformReceiptNumber: pago ${paymentId} no existe.`);
      }
      return existing;
    },

    /**
     * Reads everything required by step 2 in a single query: payment +
     * subscription + recipient organization + FitStack emitter settings.
     * `null` if payment does not exist (consumer acks, no retry).
     */
    async getPlatformReceiptComposedData(
      paymentId: number,
    ): Promise<PlatformReceiptComposedData | null> {
      assertPaymentId(paymentId, 'getPlatformReceiptComposedData');

      const [row] = await db
        .select({
          payment: platformSubscriptionPayment,
          subscription: platformSubscription,
          organization,
        })
        .from(platformSubscriptionPayment)
        .leftJoin(
          platformSubscription,
          eq(platformSubscriptionPayment.subscriptionId, platformSubscription.id),
        )
        .innerJoin(
          organization,
          eq(platformSubscriptionPayment.organizationId, organization.id),
        )
        .where(eq(platformSubscriptionPayment.id, paymentId))
        .limit(1);
      if (!row) return null;

      const settings = await db.select().from(platformSetting);
      const emitter: Record<string, string> = {};
      for (const s of settings) emitter[s.key] = s.value;

      return {
        payment: row.payment,
        subscription: row.subscription,
        organization: row.organization,
        emitter,
      };
    },

    /**
     * Completes PDF: sets `receipt_pdf_key` ONLY if not already present
     * (`WHERE receipt_pdf_key IS NULL RETURNING`). Email gate:
     * `completed === true` indicates THIS delivery finished the PDF.
     */
    async completePlatformReceiptPdf(
      paymentId: number,
      key: string,
    ): Promise<{ completed: boolean }> {
      assertPaymentId(paymentId, 'completePlatformReceiptPdf');
      if (!key || key.trim().length === 0) {
        throw new Error('completePlatformReceiptPdf: key es obligatoria.');
      }
      const [row] = await db
        .update(platformSubscriptionPayment)
        .set({ receiptPdfKey: key })
        .where(
          and(
            eq(platformSubscriptionPayment.id, paymentId),
            isNull(platformSubscriptionPayment.receiptPdfKey),
          ),
        )
        .returning({ id: platformSubscriptionPayment.id });
      return { completed: row !== undefined };
    },

    /**
     * Completes VOIDED PDF (Panel mirror): sets `receipt_voided_pdf_key`
     * ONLY if not already present. No effect on email (`receipt_notified_at`
     * is untouched). The issued PDF remains intact.
     */
    async completePlatformVoidedReceiptPdf(
      paymentId: number,
      key: string,
    ): Promise<{ completed: boolean }> {
      assertPaymentId(paymentId, 'completePlatformVoidedReceiptPdf');
      if (!key || key.trim().length === 0) {
        throw new Error('completePlatformVoidedReceiptPdf: key es obligatoria.');
      }
      const [row] = await db
        .update(platformSubscriptionPayment)
        .set({ receiptVoidedPdfKey: key })
        .where(
          and(
            eq(platformSubscriptionPayment.id, paymentId),
            isNull(platformSubscriptionPayment.receiptVoidedPdfKey),
          ),
        )
        .returning({ id: platformSubscriptionPayment.id });
      return { completed: row !== undefined };
    },

    /**
     * Marks email notification as delivered. Anti-loss gate: retries
     * check `receipt_notified_at` to avoid resending, and if delivery
     * fails the caller resets the flag and retries.
     */
    async markPlatformReceiptNotified(paymentId: number): Promise<{ completed: boolean }> {
      assertPaymentId(paymentId, 'markPlatformReceiptNotified');
      const [row] = await db
        .update(platformSubscriptionPayment)
        .set({ receiptNotifiedAt: new Date() })
        .where(
          and(
            eq(platformSubscriptionPayment.id, paymentId),
            isNull(platformSubscriptionPayment.receiptNotifiedAt),
          ),
        )
        .returning({ id: platformSubscriptionPayment.id });
      return { completed: row !== undefined };
    },

    /** Resets notification flag (best-effort) if delivery failed. */
    async clearPlatformReceiptNotified(paymentId: number): Promise<void> {
      assertPaymentId(paymentId, 'clearPlatformReceiptNotified');
      await db
        .update(platformSubscriptionPayment)
        .set({ receiptNotifiedAt: null })
        .where(eq(platformSubscriptionPayment.id, paymentId));
    },

    /**
     * Sets payer ONLY if missing (`WHERE payer_email IS NULL`):
     * validation session (support) never overwrites real payer
     * recorded during `processing` creation. Avoids cross-org PII leakage.
     */
    async setPlatformPayerIfMissing(
      paymentId: number,
      payerEmail: string,
      payerName: string,
    ): Promise<void> {
      assertPaymentId(paymentId, 'setPlatformPayerIfMissing');
      if (!payerEmail || payerEmail.trim().length === 0) return;
      await db
        .update(platformSubscriptionPayment)
        .set({ payerEmail: payerEmail.trim(), payerName: payerName?.trim() || null })
        .where(
          and(
            eq(platformSubscriptionPayment.id, paymentId),
            isNull(platformSubscriptionPayment.payerEmail),
          ),
        );
    },

    /**
     * Marks a SaaS receipt as VOIDED. Preserves number and PDF;
     * never releases or reuses the number (frozen decision, Panel mirror).
     *
     * Idempotent at the STORAGE layer too (`receipt_voided = false` in the
     * WHERE): a second delivery returns the row without rewriting the audit
     * trail (`voided_by` / `voided_at` / `void_reason`).
     */
    async markPlatformVoided(
      paymentId: number,
      input: MarkPlatformVoidedInput,
    ): Promise<DbPlatformPayment> {
      assertPaymentId(paymentId, 'markPlatformVoided');
      if (!input.by || input.by.trim().length === 0) {
        throw new Error('markPlatformVoided: by (actor) is required.');
      }
      if (!input.reason || input.reason.trim().length === 0) {
        throw new Error('markPlatformVoided: reason no vacío es obligatorio.');
      }

      const [row] = await db
        .update(platformSubscriptionPayment)
        .set({
          receiptVoided: true,
          voidedBy: input.by,
          voidedAt: new Date(),
          voidReason: input.reason,
        })
        .where(
          and(
            eq(platformSubscriptionPayment.id, paymentId),
            eq(platformSubscriptionPayment.receiptVoided, false),
          ),
        )
        .returning();
      if (row) return row;

      // Already voided → return the stored row untouched (audit preserved).
      const [existing] = await db
        .select()
        .from(platformSubscriptionPayment)
        .where(eq(platformSubscriptionPayment.id, paymentId));
      if (!existing) {
        throw new Error(`markPlatformVoided: pago ${paymentId} no existe.`);
      }
      return existing;
    },

    /**
     * Repairs the void whose second write was lost (Panel mirror): the status
     * change sets `status = 'voided'` first and `markPlatformVoided` second;
     * if the second write fails the payment stays voided with
     * `receipt_voided = false`, invisible to the sweep, and the ORIGINAL PDF
     * keeps being served. Flips ONLY the flag: the audit (`voided_by` /
     * `voided_at` / `void_reason`) is preserved verbatim.
     *
     * `flagged: true` = THIS call flipped it (the caller owns the render).
     */
    async flagPlatformVoidedIfMissing(
      paymentId: number,
    ): Promise<{ flagged: boolean }> {
      assertPaymentId(paymentId, 'flagPlatformVoidedIfMissing');
      const [row] = await db
        .update(platformSubscriptionPayment)
        .set({ receiptVoided: true })
        .where(
          and(
            eq(platformSubscriptionPayment.id, paymentId),
            eq(platformSubscriptionPayment.status, 'voided'),
            isNotNull(platformSubscriptionPayment.receiptNumber),
            eq(platformSubscriptionPayment.receiptVoided, false),
          ),
        )
        .returning({ id: platformSubscriptionPayment.id });
      return { flagged: row !== undefined };
    },
  };
}

export type PlatformReceiptsRepository = ReturnType<typeof createPlatformReceiptsRepository>;
