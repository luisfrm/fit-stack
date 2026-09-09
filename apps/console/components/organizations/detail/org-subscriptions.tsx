"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { SubscriptionsTable } from "@/components/platform/subscriptions-table";
import type { CurrencyFormat } from "@/lib/utils/value-converters";
import type { SubscriptionWithDetails } from "@/lib/services/platform-subscriptions-service";

interface OrgSubscriptionsProps {
  readonly subscriptions: SubscriptionWithDetails[];
  readonly total: number;
  readonly totalPages: number;
  readonly page: number;
  readonly limit: number;
  readonly currencyFormat: CurrencyFormat;
  readonly settings?: Record<string, string>;
  readonly onRefresh?: () => Promise<void>;
}

/** Misma tabla de suscripciones, acotada a una org (máx `limit` + paginación URL). */
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
