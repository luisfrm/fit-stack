/* ── Platform receipts report service (api-worker) ──────────────────────
   Mirrors the Panel receipt report (`reports.service.ts`) for
   the global `FS-N` series: rows + summary + totals by currency + gaps
   (suspicious gap vs explained void).
   Deliberate differences:
   - No organization in scope: issuer is FitStack (single series).
   - Dates in UTC (platform billing), never organization timezone.
   - `year` filters by UTC year of `payment_date` (series has no year).
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

/** Start of UTC day (`YYYY-MM-DD`). Invalid date → visible error. */
function utcDayStart(date: string): Date {
  const parsed = new Date(`${date}T00:00:00.000Z`);
  if (Number.isNaN(parsed.getTime())) {
    throw new TypeError(`getPlatformReceiptsReport: fecha inválida (${date}).`);
  }
  return parsed;
}

/** End of UTC day (`YYYY-MM-DD`), inclusive. */
function utcDayEnd(date: string): Date {
  const parsed = new Date(`${date}T23:59:59.999Z`);
  if (Number.isNaN(parsed.getTime())) {
    throw new TypeError(`getPlatformReceiptsReport: fecha inválida (${date}).`);
  }
  return parsed;
}

export function createPlatformReceiptsReportService(
  reportRepo: PlatformReceiptsReportRepository,
  receiptsRepo: PlatformReceiptsRepository,
) {
  /**
   * Gaps in global series. Local function (not method with `this`) so it
   * works when destructured. Throws on broken sequence.
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
      // Cap at 1000 = CSV export (UI uses 20). See route.
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
        const state = classifyReceiptState({
          voided: row.receiptVoided,
          noNumber: row.receiptNumber === null,
          noPdf: row.receiptPdfKey === null,
        });
        let pdfStatus: 'ready' | 'pending' | null = null;
        if (row.receiptPdfKey) {
          pdfStatus = 'ready';
        } else if (state === 'pending') {
          pdfStatus = 'pending';
        }
        // `payment_date` is NOT NULL: null/invalid is visible data corruption,
        // never masked with a fabricated date.
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
          pdfStatus,
          // SaaS recipient: the paying organization (Panel: the member).
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
          // Issuer is FitStack: no fiscal override per receipt.
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
