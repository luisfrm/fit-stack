import { DashboardHeader } from "@workspace/ui/components/dashboard-header";
import { api } from "@/lib/api/client";
import { PLATFORM_SETTINGS_KEYS } from "@/lib/config/platform-settings";
import { platformSubscriptionsService } from "@/lib/services/platform-subscriptions-service";
import type { CurrencyFormat } from "@workspace/shared";
import type {
  IReceiptsReportResult,
  ReceiptReportStatusFilter,
} from "@workspace/shared/types";
import { ReceiptsReportClient } from "./receipts-report-client";

export const dynamic = "force-dynamic";

const PAGE_LIMIT = 20;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

const VALID_STATUSES: ReceiptReportStatusFilter[] = [
  "all",
  "issued",
  "pending",
  "voided",
  "pre_system",
  "gaps",
];

const EMPTY_REPORT: IReceiptsReportResult = {
  rows: [],
  page: 1,
  limit: PAGE_LIMIT,
  total: 0,
  totalPages: 0,
  summary: { issued: 0, pending: 0, voided: 0, preSystem: 0 },
  totals: [],
  gaps: [],
};

/**
 * Auditoría del correlativo global `FS-N` (espejo del reporte del Panel).
 * La serie es única y continua: el emisor es FitStack, no una organización.
 */
export default async function PlatformReceiptsReportPage({
  searchParams,
}: {
  searchParams: Promise<{
    from?: string;
    to?: string;
    status?: string;
    method?: string;
    year?: string;
    page?: string;
  }>;
}) {
  const params = await searchParams;
  const status: ReceiptReportStatusFilter = VALID_STATUSES.includes(
    params.status as ReceiptReportStatusFilter,
  )
    ? (params.status as ReceiptReportStatusFilter)
    : "all";
  const page = Math.max(1, Number(params.page) || 1);

  // Filtros inválidos del usuario degradan a estado vacío visible (nunca 500
  // por query manipulada; los fallos inesperados del fetch sí propagan).
  let from = params.from || undefined;
  let to = params.to || undefined;
  let year = params.year ? Number(params.year) : undefined;
  let filtersError: string | null = null;
  if ((from && !DATE_RE.test(from)) || (to && !DATE_RE.test(to))) {
    filtersError = "Rango de fechas inválido: usa YYYY-MM-DD.";
    from = undefined;
    to = undefined;
  }
  if (year !== undefined && (!Number.isInteger(year) || year < 2000 || year > 2100)) {
    filtersError = "Año inválido: usa un valor entre 2000 y 2100.";
    year = undefined;
  }

  const [report, settings] = await Promise.all([
    filtersError
      ? Promise.resolve(EMPTY_REPORT)
      : platformSubscriptionsService.getReceiptsReport(
          {
            from,
            to,
            status,
            method: params.method || undefined,
            year,
            page,
            limit: PAGE_LIMIT,
          },
          { next: { revalidate: 300, tags: ["console:receipts"] } },
        ),
    api<Record<string, string>>("/platform/settings", {
      next: { revalidate: 600, tags: ["console:settings"] },
    }),
  ]);

  const currencyFormat = settings[
    PLATFORM_SETTINGS_KEYS.CURRENCY_FORMAT
  ] as CurrencyFormat;

  return (
    <div className="flex flex-col gap-6">
      <DashboardHeader
        title="Comprobantes SaaS"
        description="Auditoría del correlativo global FS-N: emitidos, PDF pendiente, anulados y huecos de la serie."
        iconName="ReceiptText"
      />

      <ReceiptsReportClient
        initialReport={report}
        initialPage={report.page}
        initialTotalPages={report.totalPages}
        initialFilters={{
          from: params.from || "",
          to: params.to || "",
          status,
          method: params.method || "",
          year: params.year || "",
        }}
        initialCurrencyFormat={currencyFormat}
        loadError={filtersError}
      />
    </div>
  );
}
