"use client";

import * as React from "react";
import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { Badge, Text } from "@workspace/ui/components";
import type { SubscriptionWithDetails } from "@/lib/services/platform-subscriptions-service";
import { DASHBOARD_WIDGET_PAGE_SIZE } from "@/lib/dashboard/selectors";
import { OrgAvatar, WidgetCard, WidgetEmpty } from "./dashboard-widget-card";
import { formatShortDate } from "@/lib/utils/value-converters";
import { WidgetPagination } from "./dashboard-widget-pagination";

export function PaymentsReviewWidget({
  subs,
}: {
  readonly subs: SubscriptionWithDetails[];
}) {
  const [page, setPage] = React.useState(1);
  const totalPages = Math.max(
    1,
    Math.ceil(subs.length / DASHBOARD_WIDGET_PAGE_SIZE),
  );
  const safePage = Math.min(page, totalPages);
  const pageItems = subs.slice(
    (safePage - 1) * DASHBOARD_WIDGET_PAGE_SIZE,
    safePage * DASHBOARD_WIDGET_PAGE_SIZE,
  );

  return (
    <WidgetCard
      id="dashboard-payments-review"
      isEmpty={subs.length === 0}
      title="Pagos en revisión"
      count={subs.length}
      description="Pagos recibidos pendientes de validación por soporte."
      viewAllHref=""
      footer={
        <WidgetPagination
          id="dashboard-payments-review-pagination"
          page={safePage}
          totalPages={totalPages}
          onPageChange={setPage}
        />
      }
    >
      {subs.length === 0 ? (
        <WidgetEmpty message="Sin pagos en revisión." />
      ) : (
        pageItems.map((sub) => (
          <Link
            key={sub.id}
            id={`dashboard-payments-review-row-${sub.id}`}
            href={`/organizations/${sub.organizationSlug ?? sub.organizationId}`}
            title={`Revisar pago de ${sub.organizationName || sub.organizationId}`}
            className="flex items-center gap-3 py-3 border-b border-white/5 last:border-b-0 transition-colors hover:bg-white/[0.03]"
          >
            <OrgAvatar name={sub.organizationName || sub.organizationId} />
            <div className="flex flex-col min-w-0 flex-1">
              <Text size="sm" weight="bold" className="truncate">
                {sub.organizationName || sub.organizationId}
              </Text>
              <Text size="xs" variant="muted" className="truncate">
                {sub.planName ?? "—"} · vence{" "}
                {formatShortDate(sub.currentPeriodEnd)}
              </Text>
            </div>
            <Badge
              variant="warning"
              className="uppercase text-[9px] font-bold tracking-widest shrink-0"
            >
              En revisión
            </Badge>
            <ChevronRight
              size={14}
              className="text-foreground/50 shrink-0"
              aria-hidden
            />
          </Link>
        ))
      )}
    </WidgetCard>
  );
}
