"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { SubscriptionsTable } from "@/components/platform/subscriptions-table";
import type { CurrencyFormat } from "@workspace/shared";
import type { SubscriptionWithDetails } from "@/lib/services/platform-subscriptions-service";

interface OrgSubscriptionsProps {
  readonly subscriptions: SubscriptionWithDetails[];
  readonly total: number;
  readonly totalPages: number;
  readonly page: number;
  readonly limit: number;
  readonly currencyFormat: CurrencyFormat;
  /** Platform settings: required (payment methods, currency format). */
  readonly settings: Record<string, string>;
  readonly onRefresh?: () => Promise<void>;
}

/** Same subscriptions table, scoped to an org (max `limit` + URL pagination). */
export function OrgSubscriptions({
  subscriptions,
  total,
  totalPages,
  page,
  limit,
  currencyFormat,
  settings,
  onRefresh,
}: OrgSubscriptionsProps) {
  const router = useRouter();

  const setPage = (newPage: number) => {
    router.push(`?page=${newPage}`);
  };

  const handleChanged = async () => {
    await onRefresh?.();
    router.refresh();
  };

  return (
    <div data-testid="org-subs-table">
      <SubscriptionsTable
        subscriptions={subscriptions}
        currencyFormat={currencyFormat}
        settings={settings}
        linkOrganization={false}
        pagination={{
          page,
          totalPages,
          total,
          limit,
          onPageChange: setPage,
        }}
        onChange={handleChanged}
      />
    </div>
  );
}
