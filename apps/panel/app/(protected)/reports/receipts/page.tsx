import { financeService } from "@/lib/services/finance-service";
import { sessionService } from "@/lib/services/session-service";
import type {
  IReceiptsReportResult,
  ReceiptReportStatusFilter,
} from "@workspace/shared/types";
import { ReceiptsReportClient } from "./receipts-report-client";
import { updateTag } from "next/cache";

export const dynamic = "force-dynamic";

const VALID_STATUSES: ReceiptReportStatusFilter[] = [
  "all",
  "issued",
  "pending",
  "voided",
  "pre_system",
  "gaps",
];

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

const EMPTY_REPORT: IReceiptsReportResult = {
  rows: [],
  page: 1,
  limit: 20,
  total: 0,
  totalPages: 0,
  summary: { issued: 0, pending: 0, voided: 0, preSystem: 0 },
  totals: [],
  gaps: [],
};

export default async function ReceiptsReportPage({
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

  const { data: session } = await sessionService.getSession();
  const activeOrgId = session?.session?.activeOrganizationId;
  const receiptsTag = `org:${activeOrgId}:reports:receipts`;

  // Moneda y formato: columnas obligatorias de la org (sin fallback de config).
  const currencyFormat =
    (session?.activeOrganization?.currencyFormat as "latam" | "usa" | undefined) ?? "latam";

  const report = filtersError
    ? EMPTY_REPORT
    : await financeService.getReceiptsReport(
        {
          from,
          to,
          status,
          method: params.method || undefined,
          year,
          page,
          limit: 20,
        },
        { next: { revalidate: 300, tags: [receiptsTag] } },
      );

  const refreshReport = async () => {
    "use server";
    updateTag(receiptsTag);
  };

  return (
    <ReceiptsReportClient
      onSuccess={refreshReport}
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
  );
}
