/* ── Platform receipts report service (api-worker) ──────────────────────
   Espejo del reporte de comprobantes del Panel (`reports.service.ts`) para
   la serie global `FS-N`: filas + resumen + totales por moneda + gaps
   (hueco sospechoso vs anulado explicado).
   Diferencias deliberadas:
   - Sin organización en el scope: el emisor es FitStack (una sola serie).
   - Fechas en UTC (facturación de plataforma), nunca la tz de una org.
   - `year` filtra por año UTC de `payment_date` (la serie no tiene año).
   ─────────────────────────────────────────────────────────────────────── */

import type { PlatformReceiptsRepository } from '@workspace/database/repositories/platform-receipts';
import {
  computeConsoleReceiptGaps,
  parseConsoleReceiptNumber,
  type IReceiptReportRow,
  type IReceiptReportSummary,
  type IReceiptsReportResult,
  type ReceiptGapItem,
} from '@workspace/shared';
import type {
  PlatformReceiptReportState,
  PlatformReceiptsReportRepository,
} from '../repositories/platform-receipts-report.repository';
import {
  aggregateCurrencyTotals,
  asTaxDetails,
  classifyReceiptState,
  readEmitterName,
  toIsoOrNull,
} from '../lib/receipt-report';

export interface PlatformReceiptsReportFilters {
  from?: string;
  to?: string;
  status?: 'all' | 'issued' | 'pending' | 'voided' | 'pre_system' | 'gaps';
  method?: string;
  year?: number;
  page?: number;
  limit?: number;
}

/** Inicio del día UTC (`YYYY-MM-DD`). Fecha inválida → error visible. */
function utcDayStart(date: string): Date {
  const parsed = new Date(`${date}T00:00:00.000Z`);
  if (Number.isNaN(parsed.getTime())) {
    throw new Error(`getPlatformReceiptsReport: fecha inválida (${date}).`);
  }
  return parsed;
}

/** Fin del día UTC (`YYYY-MM-DD`), inclusivo. */
function utcDayEnd(date: string): Date {
  const parsed = new Date(`${date}T23:59:59.999Z`);
  if (Number.isNaN(parsed.getTime())) {
    throw new Error(`getPlatformReceiptsReport: fecha inválida (${date}).`);
  }
  return parsed;
}

export function createPlatformReceiptsReportService(
  reportRepo: PlatformReceiptsReportRepository,
  receiptsRepo: PlatformReceiptsRepository,
) {
  /**
   * Gaps de la serie global. Función local (no método con `this`) para que
   * siga funcionando desestructurada. Lanza ante correlativo roto.
   */
  async function getReceiptGaps(): Promise<ReceiptGapItem[]> {
    const { lastNumber, numbers } = await receiptsRepo.getPlatformReceiptSequenceState(
      'receipt',
    );
    if (lastNumber === 0) return [];

    const entries = numbers.flatMap((row) => {
      if (row.receiptNumber === null) return [];
      const seq = parseConsoleReceiptNumber(row.receiptNumber);
      if (seq === null) {
        throw new Error(
          `getReceiptGaps: número con formato inválido (${row.receiptNumber}).`,
        );
      }
      return [
        {
          seq,
          voided: row.receiptVoided,
          voidedBy: row.voidedBy,
          voidedAt: row.voidedAt,
          voidReason: row.voidReason,
        },
      ];
    });

    return computeConsoleReceiptGaps({ lastNumber, entries });
  }

  return {
    async getReceiptsReport(
      filters: PlatformReceiptsReportFilters,
    ): Promise<IReceiptsReportResult> {
      const status = filters.status ?? 'all';
      const page = Math.max(1, Math.floor(filters.page ?? 1));
      // Tope 1000 = exportación CSV (la página usa 20). Ver ruta.
      const limit = Math.min(1000, Math.max(1, Math.floor(filters.limit ?? 20)));

      const scope = {
        fromUtc: filters.from ? utcDayStart(filters.from) : undefined,
        toUtc: filters.to ? utcDayEnd(filters.to) : undefined,
        method: filters.method,
        year: filters.year,
      };

      const [{ rows, total }, stateCounts, moneyRows] = await Promise.all([
        status === 'gaps'
          ? Promise.resolve({ rows: [], total: 0 })
          : reportRepo.findReportRows({
              scope,
              state: status as PlatformReceiptReportState,
              page,
              limit,
            }),
        reportRepo.countReceiptStates(scope),
        reportRepo.findReceiptMoneyRows(scope),
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
          // Receptor SaaS: la organización que paga (Panel: el miembro).
          memberName: row.organizationName?.trim() || 'Organización',
          memberEmail: null,
          planName: row.planSnapshotName?.trim() || 'Plan',
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
          // El emisor es FitStack: no hay override fiscal por comprobante.
          taxOverrideReason: null,
          voidedBy: row.voidedBy,
          voidedAt: toIsoOrNull(row.voidedAt),
          voidReason: row.voidReason,
          issuedBy: row.issuedBy,
          emitterName: readEmitterName(row.emitterSnapshot),
        };
      });

      let gaps: ReceiptGapItem[] = [];
      if (status === 'all' || status === 'gaps') {
        gaps = await getReceiptGaps();
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

export type PlatformReceiptsReportService = ReturnType<
  typeof createPlatformReceiptsReportService
>;
