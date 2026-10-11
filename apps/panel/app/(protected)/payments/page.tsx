import { subscriptionsService } from "@/lib/services/subscriptions-service";
import { financeService } from "@/lib/services/finance-service";
import { sessionService } from "@/lib/services/session-service";
import { PAYMENT_STATUSES } from "@workspace/shared";
import { PaymentsClient } from "./payments-client";
import { updateTag } from "next/cache";

export const dynamic = "force-dynamic";

const PAGE_LIMIT = 10;

type MonthlyReportRow = {
  month: string;
  currency: string;
  amount: number;
  normalizedAmount: number;
  originalExchangeRate: string;
};

export default async function PaymentsPage({
  searchParams,
}: Readonly<{
  searchParams: Promise<{
    search?: string;
    status?: string;
    page?: string;
  }>;
}>) {
  const params = await searchParams;
  const search = params.search || "";
  const statusFilter = params.status || null;
  const page = Math.max(1, Number(params.page) || 1);

  const { data: session } = await sessionService.getSession();
  const activeOrgId = session?.session?.activeOrganizationId;
  const subsTag = `org:${activeOrgId}:subscriptions`;

  // Moneda y formato: columnas obligatorias de la org (sin fallback de config).
  const primaryCurrency = session?.activeOrganization?.primaryCurrency ?? "";
  const currencyFormat =
    (session?.activeOrganization?.currencyFormat as "latam" | "usa" | undefined) ?? "latam";

  const [subsResult, pendingResult, monthlyReport, analytics] = await Promise.all([
    subscriptionsService.getAll(
      {
        page,
        limit: PAGE_LIMIT,
        query: search || undefined,
        status: statusFilter || undefined,
      },
      { next: { revalidate: 60, tags: [subsTag] } },
    ),
    // Actionable "To Validate": top-5 with `processing` payment, WITHOUT cache.
    // It's a task queue (validated from here): a payment recorded through
    // another channel should appear upon refresh, not 60s later. The table can
    // tolerate 60s because all app writes purge `subsTag`.
    subscriptionsService.getAll(
      { status: PAYMENT_STATUSES.PROCESSING, limit: 5 },
      { cache: "no-store" },
    ),
    financeService
      .getRevenueReport(primaryCurrency)
      .catch(() => [] as MonthlyReportRow[]),
    financeService
      .getAnalytics(primaryCurrency)
      .catch(() => null),
  ]);

  const refreshPayments = async () => {
    "use server";
    updateTag(subsTag);
    // Any payment write affects the receipts report.
    updateTag(`org:${activeOrgId}:reports:receipts`);
  };

  return (
    <PaymentsClient
      onSuccess={refreshPayments}
      initialSubscriptions={subsResult}
      initialPage={subsResult.page}
      initialTotalPages={subsResult.totalPages}
      initialTotal={subsResult.total}
      initialQuery={search}
      initialStatus={statusFilter}
      initialPending={pendingResult.data}
      initialAnalytics={analytics}
      initialMonthlyReport={monthlyReport}
      initialCurrencyFormat={currencyFormat}
      initialPrimaryCurrency={primaryCurrency}
      limit={PAGE_LIMIT}
    />
  );
}
