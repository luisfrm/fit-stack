/* ── Platform receipts repository (C1) ─────────────────────────────────
   Acceso a datos de comprobantes del emisor FitStack (único emisor
   global, secuencia continua sin org ni año). Vive en api-worker porque
   en C1 solo el paso 1 (futuro C2) lo necesita; si C2 exige el mismo SQL
   en jobs-worker se evaluará la mudanza a shared (excepción AGENTS.md §1,
   precedente: addendum Fase 1 `77a7d8b`). C2 no duplica este SQL.
   Factory pura: recibe `Db` por parámetro (per-request, sin process.env).
   ─────────────────────────────────────────────────────────────────────── */

import { and, eq, isNull, sql, type Db } from '@workspace/database/factory';
import {
  platformDocumentSequence,
  platformSubscriptionPayment,
} from '@workspace/database/schema';
import {
  isValidConsoleReceiptNumber,
  type ReceiptDocumentType,
} from '@workspace/shared';

/** Fila de `platform_subscription_payment` (fuente del tipo). */
export type DbPlatformPayment = typeof platformSubscriptionPayment.$inferSelect;

export interface AttachPlatformReceiptInput {
  /** `FS-0000001` (formato Console, valida Fase 0). */
  receiptNumber: string;
  receiptIssuedAt: Date;
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
     * Numera un pago SaaS de forma idempotente: solo escribe si aún no
     * tiene número (`WHERE receipt_number IS NULL`). Si ya estaba numerado,
     * devuelve la fila existente re-leída (nunca se reenumera).
     */
    async attachPlatformReceipt(
      paymentId: number,
      input: AttachPlatformReceiptInput,
    ): Promise<DbPlatformPayment> {
      if (!Number.isInteger(paymentId) || paymentId < 1) {
        throw new Error(`attachPlatformReceipt: paymentId inválido (${String(paymentId)}).`);
      }
      if (!isValidConsoleReceiptNumber(input.receiptNumber)) {
        throw new Error(
          `attachPlatformReceipt: receipt_number con formato inválido (${input.receiptNumber}).`,
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
  };
}
