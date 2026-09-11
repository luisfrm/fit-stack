import { eq, and, isNull, sql, type Db } from '@workspace/database/factory';
import { organizationDocumentSequence, payment } from '@workspace/database/schema';
import type { ReceiptDocumentType } from '@workspace/shared';

/**
 * Secuencias correlativas de comprobantes (Panel = emisor por organización).
 *
 * El número se genera con UNA sola sentencia atómica
 * (`INSERT ... ON CONFLICT DO UPDATE ... RETURNING`): no requiere transacción
 * interactiva (no soportada por el driver HTTP de Neon) y cubre la carrera del
 * primer comprobante del año. El año siempre es el LOCAL del emisor (su tz).
 */

export interface NextDocumentNumberInput {
  organizationId: string;
  documentType: ReceiptDocumentType;
  year: number;
}

export interface AttachReceiptInput {
  receiptNumber: string;
  documentType: ReceiptDocumentType;
  receiptIssuedAt: Date;
  subtotal?: number | null;
  taxTotal?: number | null;
  taxDetails?: unknown[] | null;
  taxOverrideReason?: string | null;
}

export interface VoidReceiptInput {
  by?: string | null;
  reason?: string | null;
  at?: Date;
}

export function createReceiptsRepository(db: Db) {
  return {
    /**
     * Devuelve el siguiente número correlativo (1-based) para la tupla
     * (org, tipo, año), creando la fila si es el primer comprobante del año.
     */
    async nextDocumentNumber({
      organizationId,
      documentType,
      year,
    }: NextDocumentNumberInput): Promise<number> {
      const rows = await db
        .insert(organizationDocumentSequence)
        .values({ organizationId, documentType, year, lastNumber: 1 })
        .onConflictDoUpdate({
          target: [
            organizationDocumentSequence.organizationId,
            organizationDocumentSequence.documentType,
            organizationDocumentSequence.year,
          ],
          set: { lastNumber: sql`${organizationDocumentSequence.lastNumber} + 1` },
        })
        .returning({ lastNumber: organizationDocumentSequence.lastNumber });

      const next = rows[0]?.lastNumber;
      if (next === undefined) {
        throw new Error('No se pudo generar el número de comprobante');
      }
      return next;
    },

    /**
     * Asigna número + desglose de impuestos al pago. Guarda `WHERE receipt_number
     * IS NULL`: es un UPDATE condicional idempotente (un segundo intento no
     * re-numera ni pisa el comprobante existente).
     */
    async attachReceipt(
      organizationId: string,
      paymentId: number,
      data: AttachReceiptInput,
    ): Promise<{ id: number; receiptNumber: string | null } | null> {
      const rows = await db
        .update(payment)
        .set({
          receiptNumber: data.receiptNumber,
          documentType: data.documentType,
          receiptIssuedAt: data.receiptIssuedAt,
          subtotal: data.subtotal?.toString() ?? null,
          taxTotal: data.taxTotal?.toString() ?? null,
          taxDetails: data.taxDetails ?? null,
          taxOverrideReason: data.taxOverrideReason ?? null,
        })
        .where(
          and(
            eq(payment.id, paymentId),
            eq(payment.organizationId, organizationId),
            isNull(payment.receiptNumber),
          ),
        )
        .returning({ id: payment.id, receiptNumber: payment.receiptNumber });

      return rows[0] ?? null;
    },

    /**
     * Marca el comprobante como ANULADO conservando su número y PDF (nunca se
     * libera ni reutiliza el correlativo).
     */
    async markVoided(
      organizationId: string,
      paymentId: number,
      data: VoidReceiptInput = {},
    ): Promise<{ id: number } | null> {
      const rows = await db
        .update(payment)
        .set({
          receiptVoided: true,
          voidedBy: data.by ?? null,
          voidedAt: data.at ?? new Date(),
          voidReason: data.reason ?? null,
        })
        .where(and(eq(payment.id, paymentId), eq(payment.organizationId, organizationId)))
        .returning({ id: payment.id });

      return rows[0] ?? null;
    },

    async findByReceiptNumber(organizationId: string, receiptNumber: string) {
      const rows = await db
        .select()
        .from(payment)
        .where(
          and(eq(payment.organizationId, organizationId), eq(payment.receiptNumber, receiptNumber)),
        )
        .limit(1);

      return rows[0] ?? null;
    },
  };
}

export type ReceiptsRepository = ReturnType<typeof createReceiptsRepository>;
