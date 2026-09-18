import type { PaymentsRepository } from '../repositories/payments.repository';
import { OrganizationDateManager } from '../lib/date-manager';
import {
  computePanelReceiptGaps,
  parsePanelReceiptNumber,
  type IReceiptReportRow,
  type IReceiptReportSummary,
  type IReceiptsReportResult,
  type ReceiptGapItem,
} from '@workspace/shared';
import {
  aggregateCurrencyTotals,
  asTaxDetails,
  classifyReceiptState,
  readEmitterName,
  toIsoOrNull,
} from '../lib/receipt-report';

export interface ReceiptsReportFilters {
  from?: string;
  to?: string;
  status?: 'all' | 'issued' | 'pending' | 'voided' | 'pre_system' | 'gaps';
  method?: string;
  year?: number;
  page?: number;
  limit?: number;
}

export function createReportsService(paymentsRepo: PaymentsRepository) {
  /**
   * Gaps del correlativo anual. Función local (no método con `this`) para
   * que siga funcionando desestructurada. Lanza ante correlativo roto.
   */
  async function getReceiptGaps(
    organizationId: string,
    orgSlug: string,
    year: number,
  ): Promise<ReceiptGapItem[]> {
    const { lastNumber, numbers } = await paymentsRepo.getReceiptSequenceState(
      organizationId,
      year,
      orgSlug,
    );
    if (lastNumber === 0) return [];

    const entries = numbers.flatMap((row) => {
      if (row.receiptNumber === null) return [];
      const parsed = parsePanelReceiptNumber(row.receiptNumber);
      if (!parsed) {
        throw new Error(
          `getReceiptGaps: número con formato inválido (${row.receiptNumber}).`,
        );
      }
      // Otra secuencia (slug/año distinto): no pertenece a este universo.
      if (parsed.year !== year || parsed.slug !== orgSlug.toLowerCase()) return [];
      return [
        {
          seq: parsed.seq,
          voided: row.receiptVoided,
          voidedBy: row.voidedBy,
          voidedAt: row.voidedAt ? new Date(row.voidedAt) : null,
          voidReason: row.voidReason,
        },
      ];
    });

    return computePanelReceiptGaps({ year, slug: orgSlug, lastNumber, entries });
  }

  return {
    async getMonthlyRevenue(organizationId: string, timezone: string, monthsCount: number = 12) {
      const dateManager = new OrganizationDateManager(timezone);
      const startDate = dateManager.getStartOfMonthUtc(monthsCount);

      const rawData = await paymentsRepo.getAggregatedPaymentsMonthly(organizationId, startDate, dateManager);

      return rawData.map((d) => ({
        month: d.month,
        currency: d.currency,
        amount: Number(d.amount),
        normalizedAmount: Number(d.amount),
        originalExchangeRate: d.exchangeRate,
      }));
    },

    /**
     * Reporte de comprobantes (Fase 5). Lee impuestos persistidos, nunca
     * recalcula. Totales solo sobre emitidos no anulados, por moneda.
     */
    async getReceiptsReport(
      organizationId: string,
      timezone: string,
      orgSlug: string,
      filters: ReceiptsReportFilters,
    ): Promise<IReceiptsReportResult> {
      const dateManager = new OrganizationDateManager(timezone);
      // `parseLocalToUtc` lanza con fecha inválida: error visible, sin default.
      const fromUtc = filters.from ? dateManager.getStartOfDayUtc(filters.from) : undefined;
      const toUtc = filters.to ? dateManager.getEndOfDayUtc(filters.to) : undefined;
      const year =
        filters.year ?? Number(dateManager.getTodayLocalString().slice(0, 4));
      const status = filters.status ?? 'all';
      const page = Math.max(1, Math.floor(filters.page ?? 1));
      // Tope 1000 = exportación CSV (la página usa 20). Ver ruta.
      const limit = Math.min(1000, Math.max(1, Math.floor(filters.limit ?? 20)));

      const scope = { fromUtc, toUtc, method: filters.method };

      const [{ rows, total }, stateCounts, moneyRows] = await Promise.all([
        status === 'gaps'
          ? Promise.resolve({ rows: [], total: 0 })
          : paymentsRepo.findReceiptReportRows(organizationId, {
              ...scope,
              state: status,
              page,
              limit,
            }),
        paymentsRepo.countReceiptStates(organizationId, scope),
        paymentsRepo.findReceiptMoneyRows(organizationId, scope),
      ]);

      const summary: IReceiptReportSummary = {
        issued: 0,
        pending: 0,
        voided: 0,
        preSystem: 0,
      };
      for (const group of stateCounts) {
        switch (classifyReceiptState(group)) {
          case 'voided':
            summary.voided += group.count;
            break;
          case 'pre_system':
            summary.preSystem += group.count;
            break;
          case 'pending':
            summary.pending += group.count;
            break;
          default:
            summary.issued += group.count;
        }
      }

      const mapped: IReceiptReportRow[] = rows.map((row) => {
        const state = row.receiptVoided
          ? 'voided'
          : row.receiptNumber === null
            ? 'pre_system'
            : row.receiptPdfKey === null
              ? 'pending'
              : 'issued';
        // `payment_date` es NOT NULL: nula/inválida es corrupción visible,
        // nunca se enmascara con una fecha inventada.
        const paymentIso = toIsoOrNull(row.paymentDate);
        if (!paymentIso) {
          throw new Error(
            `getReceiptsReport: paymentDate inválida en pago ${row.paymentId}.`,
          );
        }
        return {
          paymentId: Number(row.paymentId),
          receiptNumber: row.receiptNumber,
          state,
          pdfStatus: row.receiptPdfKey ? 'ready' : state === 'pending' ? 'pending' : null,
          memberName:
            `${row.memberName ?? ''} ${row.memberLastName ?? ''}`.trim() || 'Miembro',
          memberEmail: row.memberEmail,
          planName: row.planSnapshotName?.trim() || 'Plan de membresía',
          subtotal: row.subtotal !== null ? Number(row.subtotal) : null,
          taxTotal: row.taxTotal !== null ? Number(row.taxTotal) : null,
          taxDetails: asTaxDetails(row.taxDetails),
          amountPaid: Number(row.amountPaid),
          currencyPaid: row.currencyPaid,
          paymentMethod: row.paymentMethod,
          paymentStatus: row.paymentStatus,
          paymentDate: paymentIso,
          receiptIssuedAt: toIsoOrNull(row.receiptIssuedAt),
          voided: row.receiptVoided,
          taxOverrideReason: row.taxOverrideReason,
          voidedBy: row.voidedBy,
          voidedAt: toIsoOrNull(row.voidedAt),
          voidReason: row.voidReason,
          issuedBy: row.issuedBy,
          emitterName: readEmitterName(row.emitterSnapshot),
        };
      });

      let gaps: ReceiptGapItem[] = [];
      if (status === 'all' || status === 'gaps') {
        gaps = await getReceiptGaps(organizationId, orgSlug, year);
      }

      return {
        rows: mapped,
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
        summary,
        totals: aggregateCurrencyTotals(moneyRows),
        gaps,
      };
    },
  };
}

export type ReportsService = ReturnType<typeof createReportsService>;
