import { eq, and, or, sql, gte, lte, desc, like, isNull, isNotNull, type Db } from '@workspace/database/factory';
import { payment, gymMember, organizationDocumentSequence } from '@workspace/database/schema';
import type { IPaymentMethodDetails } from '@workspace/shared';
import type { OrganizationDateManager } from '../lib/date-manager';

export interface IPayment {
  id?: number;
  organizationId: string;
  memberId: number;
  subscriptionId?: number | null;

  planSnapshotName: string;
  /** Centavos enteros. */
  planSnapshotPrice: number;
  planSnapshotCurrency: string;

  /** Centavos enteros. */
  amountPaid: number;
  currencyPaid: string;
  exchangeRateApplied?: string | null;

  status?: 'processing' | 'validated' | 'voided';
  paymentMethod: string;
  paymentMethodDetails?: IPaymentMethodDetails | Record<string, any> | null;

  // Correlative receipt (Fase 1). NULL = anterior al sistema (pre_system).
  receiptNumber?: string | null;
  documentType?: 'receipt' | 'invoice';
  receiptIssuedAt?: Date | null;
  receiptPdfKey?: string | null;
  taxOverrideReason?: string | null;
  receiptVoided?: boolean;
  voidedBy?: string | null;
  voidedAt?: Date | null;
  voidReason?: string | null;

  paymentDate?: Date;
  createdAt?: string | Date;
}

export interface ReceiptReportScope {
  fromUtc?: Date;
  toUtc?: Date;
  method?: string;
}

/**
 * Scope base del reporte (Fase 5): pagos `validated` + cualquier pago con
 * número (cubre `voided` con número conservado). `processing` / `voided`
 * sin número no son comprobantes y quedan fuera. Rango por
 * `receipt_issued_at` en numerados y por `payment_date` en sin numerar.
 */
function receiptReportScope(organizationId: string, filters: ReceiptReportScope) {
  const conds = [
    eq(payment.organizationId, organizationId),
    or(eq(payment.status, 'validated'), isNotNull(payment.receiptNumber)),
  ];

  if (filters.fromUtc || filters.toUtc) {
    const numberedRange = [
      isNotNull(payment.receiptNumber),
      ...(filters.fromUtc ? [gte(payment.receiptIssuedAt, filters.fromUtc)] : []),
      ...(filters.toUtc ? [lte(payment.receiptIssuedAt, filters.toUtc)] : []),
    ];
    const unnumberedRange = [
      isNull(payment.receiptNumber),
      ...(filters.fromUtc ? [gte(payment.paymentDate, filters.fromUtc)] : []),
      ...(filters.toUtc ? [lte(payment.paymentDate, filters.toUtc)] : []),
    ];
    conds.push(or(and(...numberedRange), and(...unnumberedRange)));
  }

  if (filters.method) {
    conds.push(eq(payment.paymentMethod, filters.method));
  }

  return and(...conds);
}

export function createPaymentsRepository(db: Db) {
  return {
    async create(organizationId: string, data: Omit<IPayment, 'id' | 'createdAt' | 'organizationId'>): Promise<IPayment> {
      const inserted = await db
        .insert(payment)
        .values({
          organizationId,
          memberId: data.memberId,
          subscriptionId: data.subscriptionId,
          planSnapshotName: data.planSnapshotName,
          planSnapshotPrice: data.planSnapshotPrice,
          planSnapshotCurrency: data.planSnapshotCurrency,
          amountPaid: data.amountPaid,
          currencyPaid: data.currencyPaid,
          exchangeRateApplied: data.exchangeRateApplied?.toString() ?? null,
          status: data.status ?? 'validated',
          paymentMethod: data.paymentMethod,
          paymentMethodDetails: data.paymentMethodDetails,
          receiptNumber: data.receiptNumber ?? null,
          documentType: data.documentType ?? 'receipt',
          receiptIssuedAt: data.receiptIssuedAt ?? null,
          receiptPdfKey: data.receiptPdfKey ?? null,
          taxOverrideReason: data.taxOverrideReason ?? null,
          receiptVoided: data.receiptVoided ?? false,
          voidedBy: data.voidedBy ?? null,
          voidedAt: data.voidedAt ?? null,
          voidReason: data.voidReason ?? null,
          paymentDate: data.paymentDate ?? new Date(),
        })
        .returning();
      return inserted[0] as unknown as IPayment;
    },

    async findById(organizationId: string, id: number): Promise<IPayment | undefined> {
      const records = await db
        .select()
        .from(payment)
        .where(and(eq(payment.id, id), eq(payment.organizationId, organizationId)));
      return records[0] as unknown as IPayment | undefined;
    },

    async findBySubscriptionId(organizationId: string, subscriptionId: number): Promise<IPayment | undefined> {
      const records = await db
        .select()
        .from(payment)
        .where(and(eq(payment.subscriptionId, subscriptionId), eq(payment.organizationId, organizationId)));
      return records[0] as unknown as IPayment | undefined;
    },

    async findByMemberId(organizationId: string, memberId: number): Promise<IPayment[]> {
      const records = await db
        .select()
        .from(payment)
        .where(and(eq(payment.memberId, memberId), eq(payment.organizationId, organizationId)));
      return records as unknown as IPayment[];
    },

    /**
     * Cambia el estado del pago. Al anular (`voided`) persiste SIEMPRE la
     * auditoría (`voidedBy`/`voidedAt`/`voidReason`), haya o no comprobante
     * emitido: "rechazado" vs "anulado" se deriva con `getVoidKind`, no de
     * columnas distintas. `receiptVoided` lo maneja el repo de comprobantes.
     */
    async updateStatus(
      organizationId: string,
      id: number,
      status: 'processing' | 'validated' | 'voided',
      meta?: { voidedBy?: string; voidReason?: string; voidedAt?: Date }
    ): Promise<IPayment | undefined> {
      const update: Record<string, unknown> = { status };
      if (status === 'voided') {
        // COALESCE preserva la primera auditoría: un re-void idempotente no
        // debe pisar `voidedBy`/`voidedAt`/`voidReason` con null.
        update.voidedBy = sql`COALESCE(${payment.voidedBy}, ${meta?.voidedBy ?? null})`;
        update.voidedAt = sql`COALESCE(${payment.voidedAt}, ${meta?.voidedAt ?? new Date()})`;
        update.voidReason = sql`COALESCE(${payment.voidReason}, ${meta?.voidReason ?? null})`;
      }
      const updated = await db
        .update(payment)
        .set(update)
        .where(and(eq(payment.id, id), eq(payment.organizationId, organizationId)))
        .returning();
      return updated[0] as unknown as IPayment | undefined;
    },

    async getAggregatedPayments(organizationId: string, startDate: Date, dateManager: OrganizationDateManager) {
      return db
        .select({
          day: dateManager.formatDaySql(payment.paymentDate),
          currency: payment.currencyPaid,
          amount: sql<number>`SUM(${payment.amountPaid})`.mapWith(Number),
          exchangeRate: payment.exchangeRateApplied,
        })
        .from(payment)
        .where(
          and(
            eq(payment.organizationId, organizationId),
            eq(payment.status, 'validated'),
            gte(payment.paymentDate, startDate)
          )
        )
        .groupBy(sql`1`, payment.currencyPaid, payment.exchangeRateApplied)
        .orderBy(sql`1`);
    },

    async getAggregatedPaymentsMonthly(organizationId: string, startDate: Date, dateManager: OrganizationDateManager) {
      return db
        .select({
          month: dateManager.formatMonthSql(payment.paymentDate),
          currency: payment.currencyPaid,
          amount: sql<number>`SUM(${payment.amountPaid})`.mapWith(Number),
          exchangeRate: payment.exchangeRateApplied,
        })
        .from(payment)
        .where(
          and(
            eq(payment.organizationId, organizationId),
            eq(payment.status, 'validated'),
            gte(payment.paymentDate, startDate)
          )
        )
        .groupBy(sql`1`, payment.currencyPaid, payment.exchangeRateApplied)
        .orderBy(sql`1`);
    },

    async getPendingPaymentsCount(organizationId: string) {
      const result = await db
        .select({ count: sql<number>`count(*)` })
        .from(payment)
        .where(and(eq(payment.organizationId, organizationId), eq(payment.status, 'processing')));
      return result[0]?.count || 0;
    },

    async getPaymentsByMethod(organizationId: string, startDate: Date) {      return db
        .select({
          paymentMethod: payment.paymentMethod,
          currencyPaid: payment.currencyPaid,
          totalAmount: sql<number>`SUM(${payment.amountPaid})`.mapWith(Number),
          count: sql<number>`count(*)`.mapWith(Number),
        })
        .from(payment)
        .where(
          and(
            eq(payment.organizationId, organizationId),
            eq(payment.status, 'validated'),
            gte(payment.paymentDate, startDate)
          )
        )
        .groupBy(payment.paymentMethod, payment.currencyPaid)
        .orderBy(sql`count(*) DESC`);
    },

    /**
     * Reporte de comprobantes (Fase 5). La clasificación por estado vive en
     * el servicio; aquí solo se filtra por SQL lo expresable (estado pedido,
     * método, rango) sobre el scope base compartido.
     */
    async findReceiptReportRows(
      organizationId: string,
      filters: ReceiptReportScope & {
        state?: 'all' | 'issued' | 'pending' | 'voided' | 'pre_system';
        page: number;
        limit: number;
      },
    ) {
      const conds = [receiptReportScope(organizationId, filters)];

      switch (filters.state ?? 'all') {
        // Emitido = numerado, no anulado Y con PDF (pendiente es subconjunto
        // propio: numerado sin PDF). El summary usa la misma regla.
        case 'issued':
          conds.push(
            and(
              isNotNull(payment.receiptNumber),
              eq(payment.receiptVoided, false),
              isNotNull(payment.receiptPdfKey),
            ),
          );
          break;
        case 'pending':
          conds.push(
            and(
              isNotNull(payment.receiptNumber),
              eq(payment.receiptVoided, false),
              isNull(payment.receiptPdfKey),
            ),
          );
          break;
        case 'voided':
          conds.push(eq(payment.receiptVoided, true));
          break;
        case 'pre_system':
          conds.push(isNull(payment.receiptNumber));
          break;
      }

      const where = and(...conds);
      const offset = (Math.max(1, filters.page) - 1) * filters.limit;

      const rows = await db
        .select({
          paymentId: payment.id,
          receiptNumber: payment.receiptNumber,
          receiptVoided: payment.receiptVoided,
          receiptPdfKey: payment.receiptPdfKey,
          receiptIssuedAt: payment.receiptIssuedAt,
          memberName: gymMember.firstName,
          memberLastName: gymMember.lastName,
          memberEmail: gymMember.email,
          planSnapshotName: payment.planSnapshotName,
          subtotal: payment.subtotal,
          taxTotal: payment.taxTotal,
          taxDetails: payment.taxDetails,
          amountPaid: payment.amountPaid,
          currencyPaid: payment.currencyPaid,
          paymentMethod: payment.paymentMethod,
          paymentStatus: payment.status,
          paymentDate: payment.paymentDate,
          taxOverrideReason: payment.taxOverrideReason,
          voidedBy: payment.voidedBy,
          voidedAt: payment.voidedAt,
          voidReason: payment.voidReason,
          // C1/C5: emisor congelado + actor, para el libro exportable.
          emitterSnapshot: payment.emitterSnapshot,
          issuedBy: payment.issuedBy,
        })
        .from(payment)
        // LEFT: un pago huérfano (miembro borrado) debe aparecer en filas
        // igual que en summary/totales, no descuadrar el reporte.
        .leftJoin(gymMember, eq(payment.memberId, gymMember.id))
        .where(where)
        .orderBy(sql`${payment.receiptIssuedAt} DESC NULLS LAST`, desc(payment.id))
        .limit(filters.limit)
        .offset(offset);

      const countResult = await db
        .select({ total: sql<number>`count(*)`.mapWith(Number) })
        .from(payment)
        .where(where);

      return { rows, total: countResult[0]?.total ?? 0 };
    },

    /**
     * Columnas de dinero del universo de emitidos no anulados (sin paginar)
     * para agregar totales por moneda en el servicio. Solo lectura.
     */
    async findReceiptMoneyRows(organizationId: string, filters: ReceiptReportScope) {
      const where = and(
        receiptReportScope(organizationId, filters),
        isNotNull(payment.receiptNumber),
        eq(payment.receiptVoided, false),
      );

      return db
        .select({
          subtotal: payment.subtotal,
          taxTotal: payment.taxTotal,
          taxDetails: payment.taxDetails,
          amountPaid: payment.amountPaid,
          currencyPaid: payment.currencyPaid,
        })
        .from(payment)
        .where(where);
    },

    /**
     * Conteo por estado en una sola query (para el summary, sobre el mismo
     * scope que las filas). La etiqueta final la pone el servicio con la
     * misma regla que clasifica las filas.
     */
    async countReceiptStates(organizationId: string, filters: ReceiptReportScope) {
      return db
        .select({
          voided: payment.receiptVoided,
          noNumber: sql<boolean>`${payment.receiptNumber} IS NULL`,
          noPdf: sql<boolean>`${payment.receiptPdfKey} IS NULL`,
          count: sql<number>`count(*)`.mapWith(Number),
        })
        .from(payment)
        .where(receiptReportScope(organizationId, filters))
        .groupBy(
          payment.receiptVoided,
          sql`${payment.receiptNumber} IS NULL`,
          sql`${payment.receiptPdfKey} IS NULL`,
        );
    },

    /**
     * Estado de la secuencia anual + números emitidos del año (para gaps).
     * El parse/validación vive en el servicio (helper puro de shared).
     */
    async getReceiptSequenceState(organizationId: string, year: number, slug: string) {      const [seq] = await db
        .select({ lastNumber: organizationDocumentSequence.lastNumber })
        .from(organizationDocumentSequence)
        .where(
          and(
            eq(organizationDocumentSequence.organizationId, organizationId),
            eq(organizationDocumentSequence.documentType, 'receipt'),
            eq(organizationDocumentSequence.year, year),
          ),
        );

      const numbers = await db
        .select({
          receiptNumber: payment.receiptNumber,
          receiptVoided: payment.receiptVoided,
          voidedBy: payment.voidedBy,
          voidedAt: payment.voidedAt,
          voidReason: payment.voidReason,
        })
        .from(payment)
        .where(
          and(
            eq(payment.organizationId, organizationId),
            // Slug en minúsculas (el correlativo normaliza) y con `%_\\`
            // escapados para no alterar el universo de gaps vía LIKE.
            like(
              payment.receiptNumber,
              `${slug.toLowerCase().replaceAll(/[%_\\]/g, (c) => `\\${c}`)}-${year}-%`,
            ),
          ),
        );

      return { lastNumber: seq?.lastNumber ?? 0, numbers };
    },
  };
}

export type PaymentsRepository = ReturnType<typeof createPaymentsRepository>;
