/* ── Platform receipts repository (SHARED) ───────────────────────────────
   Excepción consciente a AGENTS.md §1: todo acceso a datos de comprobantes
   SaaS vive aquí porque DOS runtimes (api-worker paso 1, jobs-worker paso 2
   + barrido) necesitan la implementación IDÉNTICA — la sentencia atómica y
   las condiciones WHERE son el corazón de la garantía de no-duplicados.
   Mudado desde api-worker en C2 (precedente: addendum Fase 1 `77a7d8b`).
   Factory pura: recibe `Db` por parámetro (per-request, sin process.env).
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

/** Filas tal como las devuelve Drizzle (fuente de los tipos). */
export type DbPlatformPayment = typeof platformSubscriptionPayment.$inferSelect;
export type DbPlatformSubscription = typeof platformSubscription.$inferSelect;
export type DbPlatformOrganization = typeof organization.$inferSelect;

/** Datos crudos para el compose del comprobante SaaS (shared, puro). */
export interface PlatformReceiptComposedData {
  payment: DbPlatformPayment;
  subscription: DbPlatformSubscription | null;
  organization: DbPlatformOrganization;
  /** `platform_setting` completo (keys emisor FitStack, C1). */
  emitter: Record<string, string>;
}

export interface AttachPlatformReceiptInput {
  /** `FS-0000001` (formato Console, valida Fase 0). */
  receiptNumber: string;
  receiptIssuedAt: Date;
  /** Centavos enteros; el paso 1 siempre los persiste junto al número. */
  subtotal?: number | null;
  taxTotal?: number | null;
  taxDetails?: unknown;
  /** Identidad del emisor (FitStack) congelada al emitir (C1). */
  emitterSnapshot?: ReceiptEmitterSnapshot | null;
  /** Actor que emite (C5). Ausente en el barrido: queda `null`. */
  issuedBy?: string | null;
}

export interface MarkPlatformVoidedInput {
  /** Actor (user.id) que anula. */
  by: string;
  /** Motivo no vacío (auditoría). */
  reason: string;
}

function assertPaymentId(paymentId: number, method: string): void {
  if (!Number.isInteger(paymentId) || paymentId < 1) {
    throw new Error(`${method}: paymentId inválido (${String(paymentId)}).`);
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
     * Siguiente número global con UNA sola sentencia atómica
     * (INSERT ... ON CONFLICT DO UPDATE ... RETURNING). Sin transacciones
     * interactivas (driver HTTP de Neon), sin SELECT FOR UPDATE. Cubre la
     * carrera del primer comprobante sin fila previa. Nunca hay rollback.
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
      // El INSERT ... RETURNING siempre devuelve fila (creada o actualizada).
      // Sin fallback silencioso: un 1 inventado duplicaría correlativos.
      if (!row) {
        throw new Error('nextPlatformDocumentNumber: INSERT ... RETURNING no devolvió fila.');
      }
      return row.nextNumber;
    },

    /**
     * Compensación del correlativo global: devuelve el último número
     * consumido por esta entrega cuando PERDIÓ la carrera de
     * `attachPlatformReceipt` (otra entrega ya numeró el pago).
     *
     * Solo revierte si seguimos siendo el último consumidor
     * (`next_number = seq`): retroceder con consumidores posteriores
     * reasignaría un número ya vivo — prohibido. Si no, `released: false`
     * y el número queda como hueco auditado.
     */
    async releaseLastPlatformNumber(
      type: ReceiptDocumentType,
      seq: number,
    ): Promise<{ released: boolean }> {
      assertDocumentType(type, 'releaseLastPlatformNumber');
      if (!Number.isInteger(seq) || seq < 1) {
        throw new Error(`releaseLastPlatformNumber: seq inválido (${String(seq)}).`);
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
     * Estado de la secuencia global + números emitidos del universo, para la
     * auditoría de gaps de Console. Espejo de
     * `payments.repository.getReceiptSequenceState` (Panel) sin año ni org:
     * `FS-N` es una serie única y continua.
     * OJO: `next_number` guarda el ÚLTIMO número entregado (no el siguiente).
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
     * Numera un pago SaaS de forma idempotente: solo escribe si aún no
     * tiene número (`WHERE receipt_number IS NULL`). Si ya estaba numerado,
     * devuelve la fila existente re-leída (nunca se reenumera).
     */
    async attachPlatformReceipt(
      paymentId: number,
      input: AttachPlatformReceiptInput,
    ): Promise<DbPlatformPayment> {
      assertPaymentId(paymentId, 'attachPlatformReceipt');
      if (typeof input.receiptNumber !== 'string' || !isValidConsoleReceiptNumber(input.receiptNumber)) {
        throw new Error(
          `attachPlatformReceipt: receipt_number con formato inválido (${String(input.receiptNumber)}).`,
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
          // C1/C5: identidad congelada + actor, en la misma sentencia que el
          // número (el comprobante nace reproducible).
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
        throw new Error(`attachPlatformReceipt: pago ${paymentId} no existe.`);
      }
      return existing;
    },

    /**
     * Lee todo lo que el paso 2 necesita en una sola pasada: pago +
     * suscripción + organización receptora + settings del emisor FitStack.
     * `null` si el pago no existe (el consumer hace ack, no retry).
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
     * Completa el PDF: fija `receipt_pdf_key` SOLO si aún no hay uno
     * (`WHERE receipt_pdf_key IS NULL RETURNING`). EL gate del email:
     * `completed === true` significa que ESTA entrega completó el PDF.
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
     * Marca la notificación por email como hecha. Gate anti-pérdida: el
     * reintento usa `receipt_notified_at` para no re-enviar, y si el envío
     * falla el caller limpia la marca y reintenta.
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

    /** Revierte la marca de notificación (best-effort) si el envío falló. */
    async clearPlatformReceiptNotified(paymentId: number): Promise<void> {
      assertPaymentId(paymentId, 'clearPlatformReceiptNotified');
      await db
        .update(platformSubscriptionPayment)
        .set({ receiptNotifiedAt: null })
        .where(eq(platformSubscriptionPayment.id, paymentId));
    },

    /**
     * Fija el pagador SOLO si está vacío (`WHERE payer_email IS NULL`):
     * la sesión de validación (soporte) nunca sobrescribe al pagador real
     * registrado en la creación `processing`. Sin PII cross-org.
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
     * Marca un comprobante SaaS como ANULADO. Conserva el número y el PDF;
     * nunca libera ni reusa el número (decisión congelada, espejo Panel).
     */
    async markPlatformVoided(
      paymentId: number,
      input: MarkPlatformVoidedInput,
    ): Promise<DbPlatformPayment> {
      assertPaymentId(paymentId, 'markPlatformVoided');
      if (!input.by || input.by.trim().length === 0) {
        throw new Error('markPlatformVoided: by (actor) es obligatorio.');
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
        .where(eq(platformSubscriptionPayment.id, paymentId))
        .returning();
      if (!row) {
        throw new Error(`markPlatformVoided: pago ${paymentId} no existe.`);
      }
      return row;
    },
  };
}

export type PlatformReceiptsRepository = ReturnType<typeof createPlatformReceiptsRepository>;
