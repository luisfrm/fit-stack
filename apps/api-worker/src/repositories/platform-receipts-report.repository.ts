/* ── Platform receipts report repository (api-worker) ───────────────────
   Consultas del reporte de comprobantes SaaS (auditoría de la serie `FS-N`).
   Espejo de las de Panel en `payments.repository.ts` (Fase 5), con dos
   diferencias deliberadas:
   - Sin `organizationId`: el emisor es FitStack, la serie es global.
   - Fechas siempre en UTC: la facturación de plataforma corre en UTC
     (no usa la tz de la organización).
   La clasificación por estado vive en el servicio; aquí solo se filtra por
   SQL lo expresable.
   ─────────────────────────────────────────────────────────────────────── */

import {
  and,
  desc,
  eq,
  gte,
  isNotNull,
  isNull,
  lte,
  or,
  sql,
  type Db,
} from '@workspace/database/factory';
import { organization, platformSubscriptionPayment } from '@workspace/database/schema';

export interface PlatformReceiptReportScope {
  fromUtc?: Date;
  toUtc?: Date;
  method?: string;
  /**
   * Año UTC de `payment_date`. La serie `FS-N` es continua y no lleva año,
   * así que este filtro es por fecha de pago, no por universo de correlativo.
   */
  year?: number;
}

export type PlatformReceiptReportState =
  | 'all'
  | 'issued'
  | 'pending'
  | 'voided'
  | 'pre_system';

/**
 * Scope base: pagos validados + cualquier pago con número (cubre un
 * `voided` que conserva su número). `pending`/`processing` sin número no son
 * comprobantes y quedan fuera. Rango por `receipt_issued_at` en numerados y
 * por `payment_date` en sin numerar.
 */
function reportScope(filters: PlatformReceiptReportScope) {
  const conds = [
    or(
      eq(platformSubscriptionPayment.status, 'validated'),
      isNotNull(platformSubscriptionPayment.receiptNumber),
    ),
  ];

  if (filters.fromUtc || filters.toUtc) {
    const numberedRange = [
      isNotNull(platformSubscriptionPayment.receiptNumber),
      ...(filters.fromUtc
        ? [gte(platformSubscriptionPayment.receiptIssuedAt, filters.fromUtc)]
        : []),
      ...(filters.toUtc
        ? [lte(platformSubscriptionPayment.receiptIssuedAt, filters.toUtc)]
        : []),
    ];
    const unnumberedRange = [
      isNull(platformSubscriptionPayment.receiptNumber),
      ...(filters.fromUtc
        ? [gte(platformSubscriptionPayment.paymentDate, filters.fromUtc)]
        : []),
      ...(filters.toUtc ? [lte(platformSubscriptionPayment.paymentDate, filters.toUtc)] : []),
    ];
    conds.push(or(and(...numberedRange), and(...unnumberedRange)));
  }

  if (filters.year !== undefined) {
    const year = filters.year;
    conds.push(
      and(
        gte(platformSubscriptionPayment.paymentDate, new Date(Date.UTC(year, 0, 1))),
        lte(
          platformSubscriptionPayment.paymentDate,
          new Date(Date.UTC(year, 11, 31, 23, 59, 59, 999)),
        ),
      ),
    );
  }

  if (filters.method) {
    conds.push(eq(platformSubscriptionPayment.paymentMethod, filters.method));
  }

  return and(...conds);
}

export function createPlatformReceiptsReportRepository(db: Db) {
  return {
    /** Filas paginadas del reporte, con el filtro de estado ya aplicado. */
    async findReportRows(filters: {
      scope: PlatformReceiptReportScope;
      state: PlatformReceiptReportState;
      page: number;
      limit: number;
    }) {
      const conds = [reportScope(filters.scope)];

      switch (filters.state) {
        // Emitido = numerado, no anulado Y con PDF. `pending` es su
        // complemento: numerado sin PDF.
        case 'issued':
          conds.push(
            and(
              isNotNull(platformSubscriptionPayment.receiptNumber),
              eq(platformSubscriptionPayment.receiptVoided, false),
              isNotNull(platformSubscriptionPayment.receiptPdfKey),
            ),
          );
          break;
        case 'pending':
          conds.push(
            and(
              isNotNull(platformSubscriptionPayment.receiptNumber),
              eq(platformSubscriptionPayment.receiptVoided, false),
              isNull(platformSubscriptionPayment.receiptPdfKey),
            ),
          );
          break;
        case 'voided':
          conds.push(eq(platformSubscriptionPayment.receiptVoided, true));
          break;
        case 'pre_system':
          conds.push(isNull(platformSubscriptionPayment.receiptNumber));
          break;
      }

      const where = and(...conds);
      const offset = (Math.max(1, filters.page) - 1) * filters.limit;

      const rows = await db
        .select({
          paymentId: platformSubscriptionPayment.id,
          receiptNumber: platformSubscriptionPayment.receiptNumber,
          receiptVoided: platformSubscriptionPayment.receiptVoided,
          receiptPdfKey: platformSubscriptionPayment.receiptPdfKey,
          receiptIssuedAt: platformSubscriptionPayment.receiptIssuedAt,
          organizationName: organization.name,
          planSnapshotName: platformSubscriptionPayment.planSnapshotName,
          subtotal: platformSubscriptionPayment.subtotal,
          taxTotal: platformSubscriptionPayment.taxTotal,
          taxDetails: platformSubscriptionPayment.taxDetails,
          amountPaid: platformSubscriptionPayment.amountPaid,
          currencyPaid: platformSubscriptionPayment.currencyPaid,
          paymentMethod: platformSubscriptionPayment.paymentMethod,
          paymentStatus: platformSubscriptionPayment.status,
          paymentDate: platformSubscriptionPayment.paymentDate,
          voidedBy: platformSubscriptionPayment.voidedBy,
          voidedAt: platformSubscriptionPayment.voidedAt,
          voidReason: platformSubscriptionPayment.voidReason,
        })
        .from(platformSubscriptionPayment)
        // LEFT: un pago huérfano no debe descuadrar el reporte.
        .leftJoin(organization, eq(platformSubscriptionPayment.organizationId, organization.id))
        .where(where)
        .orderBy(
          sql`${platformSubscriptionPayment.receiptIssuedAt} DESC NULLS LAST`,
          desc(platformSubscriptionPayment.id),
        )
        .limit(filters.limit)
        .offset(offset);

      const countResult = await db
        .select({ total: sql<number>`count(*)`.mapWith(Number) })
        .from(platformSubscriptionPayment)
        .where(where);

      return { rows, total: countResult[0]?.total ?? 0 };
    },

    /** Conteo por estado en una sola query (summary sobre el mismo scope). */
    async countReceiptStates(scope: PlatformReceiptReportScope) {
      return db
        .select({
          voided: platformSubscriptionPayment.receiptVoided,
          noNumber: sql<boolean>`${platformSubscriptionPayment.receiptNumber} IS NULL`,
          noPdf: sql<boolean>`${platformSubscriptionPayment.receiptPdfKey} IS NULL`,
          count: sql<number>`count(*)`.mapWith(Number),
        })
        .from(platformSubscriptionPayment)
        .where(reportScope(scope))
        .groupBy(
          platformSubscriptionPayment.receiptVoided,
          sql`${platformSubscriptionPayment.receiptNumber} IS NULL`,
          sql`${platformSubscriptionPayment.receiptPdfKey} IS NULL`,
        );
    },

    /** Columnas de dinero del universo emitido no anulado (sin paginar). */
    async findReceiptMoneyRows(scope: PlatformReceiptReportScope) {
      return db
        .select({
          subtotal: platformSubscriptionPayment.subtotal,
          taxTotal: platformSubscriptionPayment.taxTotal,
          taxDetails: platformSubscriptionPayment.taxDetails,
          amountPaid: platformSubscriptionPayment.amountPaid,
          currencyPaid: platformSubscriptionPayment.currencyPaid,
        })
        .from(platformSubscriptionPayment)
        .where(
          and(
            reportScope(scope),
            isNotNull(platformSubscriptionPayment.receiptNumber),
            eq(platformSubscriptionPayment.receiptVoided, false),
          ),
        );
    },
  };
}

export type PlatformReceiptsReportRepository = ReturnType<
  typeof createPlatformReceiptsReportRepository
>;
