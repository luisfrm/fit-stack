import { and, eq, isNull, sql, type Db } from '@workspace/database/factory';
import { organizationDocumentSequence, payment } from '@workspace/database/schema';
import {
  MAX_RECEIPT_YEAR,
  MIN_RECEIPT_YEAR,
  isValidPanelReceiptNumber,
  type ReceiptDocumentType,
} from '@workspace/shared';
import type { IPayment } from './payments.repository';

export interface AttachReceiptInput {
  receiptNumber: string;
  documentType: ReceiptDocumentType;
  receiptIssuedAt: Date;
  taxOverrideReason?: string | null;
}

export interface MarkVoidedInput {
  /** Actor (user.id) que anula. */
  by: string;
  /** Motivo no vacío (auditoría). */
  reason: string;
}

function assertOrgId(orgId: string, method: string): void {
  if (!orgId || orgId.trim().length === 0) {
    throw new Error(`${method}: orgId es obligatorio (aislamiento estricto).`);
  }
}

function assertDocumentType(type: ReceiptDocumentType, method: string): void {
  if (type !== 'receipt' && type !== 'invoice') {
    throw new Error(`${method}: document_type inválido (${String(type)}).`);
  }
}

function assertYear(year: number, method: string): void {
  if (!Number.isInteger(year) || year < MIN_RECEIPT_YEAR || year > MAX_RECEIPT_YEAR) {
    throw new Error(
      `${method}: año inválido (${String(year)}). Rango ${MIN_RECEIPT_YEAR}-${MAX_RECEIPT_YEAR}.`,
    );
  }
}

export function createReceiptsRepository(db: Db) {
  return {
    /**
     * Asigna el siguiente número correlativo con UNA sola sentencia atómica
     * (INSERT ... ON CONFLICT DO UPDATE ... RETURNING). Sin transacciones
     * interactivas (driver HTTP de Neon), sin SELECT FOR UPDATE. Cubre la
     * carrera del primer comprobante del año/emisor sin fila previa.
     * Nunca hay rollback de un número ya asignado.
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
      // El INSERT ... RETURNING siempre devuelve fila (creada o actualizada).
      // Sin fallback silencioso: un 1 inventado duplicaría correlativos.
      if (!row) {
        throw new Error('nextDocumentNumber: INSERT ... RETURNING no devolvió fila.');
      }
      return row.lastNumber;
    },

    /**
     * Numera un pago de forma idempotente: solo escribe si aún no tiene
     * número (`WHERE receipt_number IS NULL`). Si ya estaba numerado,
     * devuelve la fila existente re-leída (el número distinto se ignora,
     * nunca se duplica ni se reenumera).
     */
    async attachReceipt(
      paymentId: number,
      orgId: string,
      input: AttachReceiptInput,
    ): Promise<IPayment> {
      assertOrgId(orgId, 'attachReceipt');
      assertDocumentType(input.documentType, 'attachReceipt');
      if (!isValidPanelReceiptNumber(input.receiptNumber)) {
        throw new Error(
          `attachReceipt: receipt_number con formato inválido (${input.receiptNumber}).`,
        );
      }

      const [updated] = await db
        .update(payment)
        .set({
          receiptNumber: input.receiptNumber,
          documentType: input.documentType,
          receiptIssuedAt: input.receiptIssuedAt,
          taxOverrideReason: input.taxOverrideReason ?? null,
        })
        .where(
          and(
            eq(payment.id, paymentId),
            eq(payment.organizationId, orgId),
            isNull(payment.receiptNumber),
          ),
        )
        .returning();
      if (updated) return updated as unknown as IPayment;

      const [existing] = await db
        .select()
        .from(payment)
        .where(and(eq(payment.id, paymentId), eq(payment.organizationId, orgId)));
      if (!existing) {
        throw new Error(`attachReceipt: pago ${paymentId} no encontrado en la organización.`);
      }
      return existing as unknown as IPayment;
    },

    /**
     * Marca un comprobante como ANULADO. Conserva el número y el PDF;
     * nunca libera ni reusa el número (decisión congelada).
     */
    async markVoided(
      paymentId: number,
      orgId: string,
      input: MarkVoidedInput,
    ): Promise<IPayment> {
      assertOrgId(orgId, 'markVoided');
      if (!input.by || input.by.trim().length === 0) {
        throw new Error('markVoided: by (actor) es obligatorio.');
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
        .where(and(eq(payment.id, paymentId), eq(payment.organizationId, orgId)))
        .returning();
      if (!row) {
        throw new Error(`markVoided: pago ${paymentId} no encontrado en la organización.`);
      }
      return row as unknown as IPayment;
    },

    /** Busca un pago por su número correlativo humano (scoped por org). */
    async findByReceiptNumber(
      orgId: string,
      receiptNumber: string,
    ): Promise<IPayment | undefined> {
      assertOrgId(orgId, 'findByReceiptNumber');
      const [row] = await db
        .select()
        .from(payment)
        .where(
          and(eq(payment.organizationId, orgId), eq(payment.receiptNumber, receiptNumber)),
        );
      return row as unknown as IPayment | undefined;
    },
  };
}

export type ReceiptsRepository = ReturnType<typeof createReceiptsRepository>;
