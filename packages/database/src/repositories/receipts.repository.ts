/* ── Receipts repository (SHARED) ────────────────────────────────────────
   Excepción consciente a AGENTS.md §1: todo acceso a datos de comprobantes
   (lectura y escritura) vive aquí porque DOS runtimes (api-worker paso 1 +
   endpoints, jobs-worker paso 2 + barrido) necesitan la implementación
   IDÉNTICA — la sentencia atómica y las condiciones WHERE son el corazón de
   la garantía de no-duplicados. Ningún otro repo se mueve (ver AGENTS.md).
   Factory pura: recibe `Db` por parámetro (per-request, sin process.env).
   ─────────────────────────────────────────────────────────────────────── */

import { and, eq, isNull, sql } from 'drizzle-orm';
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
} from '@workspace/shared';

/** Fila de `payment` tal como la devuelve Drizzle (fuente del tipo, no imports cruzados). */
export type DbPayment = typeof payment.$inferSelect;
export type DbOrganization = typeof organization.$inferSelect;
export type DbGymMember = typeof gymMember.$inferSelect;
export type DbSubscription = typeof subscription.$inferSelect;

/** Filas crudas para `buildReceiptDataFromComposed` (shared, puro). */
export interface ReceiptComposedData {
  payment: DbPayment;
  organization: DbOrganization;
  member: DbGymMember | null;
  subscription: DbSubscription | null;
}

export interface AttachReceiptInput {
  receiptNumber: string;
  documentType: ReceiptDocumentType;
  receiptIssuedAt: Date;
  taxOverrideReason?: string | null;
  /** Centavos enteros; el paso 1 siempre los persiste junto al número. */
  subtotal?: number | null;
  taxTotal?: number | null;
  taxDetails?: unknown;
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
    ): Promise<DbPayment> {
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
          subtotal: input.subtotal ?? null,
          taxTotal: input.taxTotal ?? null,
          taxDetails: input.taxDetails ?? null,
        })
        .where(
          and(
            eq(payment.id, paymentId),
            eq(payment.organizationId, orgId),
            isNull(payment.receiptNumber),
          ),
        )
        .returning();
      if (updated) return updated;

      const [existing] = await db
        .select()
        .from(payment)
        .where(and(eq(payment.id, paymentId), eq(payment.organizationId, orgId)));
      if (!existing) {
        throw new Error(`attachReceipt: pago ${paymentId} no encontrado en la organización.`);
      }
      return existing;
    },

    /**
     * Marca un comprobante como ANULADO. Conserva el número y el PDF;
     * nunca libera ni reusa el número (decisión congelada).
     */
    async markVoided(
      paymentId: number,
      orgId: string,
      input: MarkVoidedInput,
    ): Promise<DbPayment> {
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
      return row;
    },

    /** Busca un pago por su número correlativo humano (scoped por org). */
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
     * Carga las filas crudas para componer `ReceiptData`
     * (`buildReceiptDataFromComposed`, shared puro). 4 selects secuenciales
     * simples, todos scoped por org. Solo carga: no calcula impuestos, no
     * resuelve gate, no enmascara. `undefined` si el pago no es de la org
     * (el caller mapea a 404).
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
     * Completa el PDF: fija `receipt_pdf_key` SOLO si aún no hay uno
     * (`WHERE receipt_pdf_key IS NULL RETURNING`). EL gate del email:
     * `completed === true` significa que ESTA entrega completó el PDF
     * (encolar email); `false` = otra entrega ya lo hizo (silencio, sin
     * segundo email). Nunca usar `attachReceipt` como gate.
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
     * Marca la notificación por email como hecha. Gate anti-pérdida: el
     * reintento del mensaje usa `receipt_notified_at` para no re-enviar, y
     * si el envío falla el caller limpia la marca y reintenta.
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

    /** Revierte la marca de notificación (best-effort) si el envío falló. */
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
