import { subscriptionsService } from "@/lib/services/subscriptions-service";
import { financeService } from "@/lib/services/finance-service";
import { sessionService } from "@/lib/services/session-service";
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
}: {
  searchParams: Promise<{
    search?: string;
    status?: string;
    page?: string;
  }>;
}) {
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

  const [subsResult, monthlyReport, analytics] = await Promise.all([
    subscriptionsService.getAll(
      {
        page,
        limit: PAGE_LIMIT,
        query: search || undefined,
        status: statusFilter || undefined,
      },
      { next: { revalidate: 60, tags: [subsTag] } },
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
      initialAnalytics={analytics}
      initialMonthlyReport={monthlyReport}
      initialCurrencyFormat={currencyFormat}
      initialPrimaryCurrency={primaryCurrency}
      limit={PAGE_LIMIT}
    />
  );
}
