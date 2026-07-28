import { subscriptionsService } from "@/lib/services/subscriptions-service";
import { financeService } from "@/lib/services/finance-service";
import { settingsService } from "@/lib/services/settings-service";
import { PaymentsClient } from "./payments-client";
import { SETTINGS_KEYS } from "@/lib/hooks/use-settings";
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

  const settings = await settingsService
    .getAll({ next: { revalidate: 600, tags: ["panel:settings"] } })
    .catch(() => ({}) as Record<string, string>);

  const primaryCurrency = settings[SETTINGS_KEYS.PRIMARY_CURRENCY] || "USD";
  const currencyFormat =
    (settings[SETTINGS_KEYS.CURRENCY_FORMAT] as "latam" | "usa") || "latam";

  const [subsResult, monthlyReport] = await Promise.all([
    subscriptionsService.getAll(
      {
        page,
        limit: PAGE_LIMIT,
        query: search || undefined,
        status: statusFilter || undefined,
      },
      { next: { revalidate: 60, tags: ["panel:subscriptions"] } },
    ),
    financeService
      .getRevenueReport(primaryCurrency)
      .catch(() => [] as MonthlyReportRow[]),
  ]);

  const refreshPayments = async () => {
    "use server";
    updateTag("panel:subscriptions");
  };
  void refreshPayments;

  return (
    <PaymentsClient
      initialSubscriptions={subsResult}
      initialPage={subsResult.page}
      initialTotalPages={subsResult.totalPages}
      initialTotal={subsResult.total}
      initialQuery={search}
      initialStatus={statusFilter}
      initialAnalytics={null}
      initialMonthlyReport={monthlyReport}
      initialCurrencyFormat={currencyFormat}
      initialPrimaryCurrency={primaryCurrency}
      limit={PAGE_LIMIT}
    />
  );
}
