/* ── Platform receipts repository (SHARED) ───────────────────────────────
   Conscious exception to AGENTS.md §1: all SaaS receipt data access
   lives here because TWO runtimes (api-worker step 1, jobs-worker step 2
   + sweep) require IDENTICAL implementations — the atomic statement and
   WHERE conditions are the core guarantee against duplicates.
   Moved from api-worker in C2 (precedent: Phase 1 addendum `77a7d8b`).
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
  /** Full `platform_setting` map (FitStack emitter keys, C1). */
  emitter: Record<string, string>;
}

export interface AttachPlatformReceiptInput {
  /** `FS-0000001` (Console format, validated Phase 0). */
  receiptNumber: string;
  receiptIssuedAt: Date;
  /** Integer cents; step 1 always persists them alongside the number. */
  subtotal?: number | null;
  taxTotal?: number | null;
  taxDetails?: unknown;
  /** Emitter identity (FitStack) frozen upon issuance (C1). */
  emitterSnapshot?: ReceiptEmitterSnapshot | null;
  /** Issuing actor (C5). Missing during sweep: remains `null`. */
  issuedBy?: string | null;
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
    throw new Error(`${method}: invalid document_type (${String(type)}). No pgEnum.`);
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
        .values({ documentType: type, nextNumber: 1 })
        .onConflictDoUpdate({
          target: [platformDocumentSequence.documentType],
          set: { nextNumber: sql`${platformDocumentSequence.nextNumber} + 1` },
        })
        .returning({ nextNumber: platformDocumentSequence.nextNumber });
      // INSERT ... RETURNING always returns a row (created or updated).
      // No silent fallback: fabricating 1 would duplicate correlative numbers.
      if (!row) {
        throw new Error('nextPlatformDocumentNumber: INSERT ... RETURNING did not return a row.');
      }
      return row.nextNumber;
    },

    /**
     * Global correlative compensation: rolls back the last number
     * consumed by this execution when it LOST the race in
     * `attachPlatformReceipt` (another execution already numbered the payment).
     *
     * Only reverts if we are still the latest consumer
     * (`next_number = seq`): decrementing with newer consumers would
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
        .set({ nextNumber: sql`${platformDocumentSequence.nextNumber} - 1` })
        .where(
          and(
            eq(platformDocumentSequence.documentType, type),
            eq(platformDocumentSequence.nextNumber, seq),
          ),
        )
        .returning({ nextNumber: platformDocumentSequence.nextNumber });
      return { released: row !== undefined };
    },

    /**
     * Global sequence status + issued numbers in the universe, for Console
     * gap audits. Mirrors `payments.repository.getReceiptSequenceState` (Panel)
     * without year or org: `FS-N` is a single continuous sequence.
     * NOTE: `next_number` stores the LAST allocated number (not the next one).
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
        .select({ nextNumber: platformDocumentSequence.nextNumber })
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

      return { lastNumber: seq?.nextNumber ?? 0, numbers };
    },

    /**
     * Numbers a SaaS payment idempotently: only writes if it doesn't
     * have a number yet (`WHERE receipt_number IS NULL`). If already numbered,
     * returns the re-read existing row (never renumbered).
     */
    async attachPlatformReceipt(
      paymentId: number,
      input: AttachPlatformReceiptInput,
    ): Promise<DbPlatformPayment> {
      assertPaymentId(paymentId, 'attachPlatformReceipt');
      if (typeof input.receiptNumber !== 'string' || !isValidConsoleReceiptNumber(input.receiptNumber)) {
        throw new Error(
          `attachPlatformReceipt: invalid receipt_number format (${String(input.receiptNumber)}).`,
        );
      }

      const [updated] = await db
        .update(platformSubscriptionPayment)
        .set({
          receiptNumber: input.receiptNumber,
          receiptIssuedAt: input.receiptIssuedAt,
          subtotal: input.subtotal ?? null,
          taxTotal: input.taxTotal ?? null,
          taxDetails: input.taxDetails ?? null,
          // C1/C5: frozen identity + actor, in the same statement as
          // the number (receipt is reproducible upon birth).
          emitterSnapshot: input.emitterSnapshot ?? null,
          issuedBy: input.issuedBy ?? null,
        })
        .where(
          and(
            eq(platformSubscriptionPayment.id, paymentId),
            isNull(platformSubscriptionPayment.receiptNumber),
          ),
        )
        .returning();

      if (updated) return updated;

      const [existing] = await db
        .select()
        .from(platformSubscriptionPayment)
        .where(eq(platformSubscriptionPayment.id, paymentId));
      if (!existing) {
        throw new Error(`attachPlatformReceipt: payment ${paymentId} does not exist.`);
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
        throw new Error('completePlatformReceiptPdf: key is required.');
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
        throw new Error('completePlatformVoidedReceiptPdf: key is required.');
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
        throw new Error('markPlatformVoided: non-empty reason is required.');
      }

      const [row] = await db
        .update(platformSubscriptionPayment)
        .set({
          receiptVoided: true,
          voidedBy: input.by,
          voidedAt: new Date(),
          voidReason: input.reason,
        })
        .where(eq(platformSubscriptionPayment.id, paymentId))
        .returning();
      if (!row) {
        throw new Error(`markPlatformVoided: payment ${paymentId} does not exist.`);
      }
      return row;
    },
  };
}

export type PlatformReceiptsRepository = ReturnType<typeof createPlatformReceiptsRepository>;
