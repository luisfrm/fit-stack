"use client";

import * as React from "react";
import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { Badge, Text } from "@workspace/ui/components";
import {
  DASHBOARD_WIDGET_PAGE_SIZE,
  type RenewalItem,
} from "@/lib/dashboard/selectors";
import { OrgAvatar, WidgetCard, WidgetEmpty } from "./dashboard-widget-card";
import { formatShortDate } from "@/lib/utils/value-converters";
import { WidgetPagination } from "./dashboard-widget-pagination";

function RenewalRow({
  item,
  href,
}: {
  readonly item: RenewalItem;
  readonly href: string;
}) {
  const { org, urgency, periodEnd } = item;
  return (
    <Link
      id={`dashboard-renewals-row-${org.id}`}
      href={href}
      title={`Ver ${org.name}`}
      className="flex items-center gap-3 py-3 border-b border-white/5 last:border-b-0 transition-colors hover:bg-white/[0.03]"
    >
      <OrgAvatar name={org.name} />
      <div className="flex flex-col min-w-0 flex-1">
        <Text size="sm" weight="bold" className="truncate">
          {org.name}
        </Text>
        <Text size="xs" variant="muted" className="truncate">
          {org.latestSubscription?.planName ?? "—"} · fin{" "}
          {formatShortDate(periodEnd)}
        </Text>
      </div>
      <Badge
        variant={urgency === "overdue" ? "destructive" : "warning"}
        className="uppercase text-[9px] font-bold tracking-widest shrink-0"
      >
        {urgency === "overdue" ? "Vencida" : "Por vencer"}
      </Badge>
      <ChevronRight
        size={14}
        className="text-foreground/50 shrink-0"
        aria-hidden
      />
    </Link>
  );
}

export function RenewalsWidget({ items }: { readonly items: RenewalItem[] }) {
  const [page, setPage] = React.useState(1);
  const totalPages = Math.max(
    1,
    Math.ceil(items.length / DASHBOARD_WIDGET_PAGE_SIZE),
  );
  const safePage = Math.min(page, totalPages);
  const pageItems = items.slice(
    (safePage - 1) * DASHBOARD_WIDGET_PAGE_SIZE,
    safePage * DASHBOARD_WIDGET_PAGE_SIZE,
  );

  const overdueCount = items.filter((i) => i.urgency === "overdue").length;
  const expiringCount = items.length - overdueCount;
  const overduePage = pageItems.filter((i) => i.urgency === "overdue");
  const expiringPage = pageItems.filter((i) => i.urgency === "expiring");

  const orgHref = (slug: string | null, id: string) =>
    `/organizations/${slug ?? id}`;

  return (
    <WidgetCard
      id="dashboard-renewals"
      isEmpty={items.length === 0}
      title="Pendientes de renovar"
      count={items.length}
      description="Vencidas y por vencer en 7 días (sin trials ni free tier)."
      viewAllHref=""
      footer={
        <WidgetPagination
          id="dashboard-renewals-pagination"
          page={safePage}
          totalPages={totalPages}
          onPageChange={setPage}
        />
      }
    >
      {items.length === 0 ? (
        <WidgetEmpty message="Nada pendiente de renovar. Todas las sedes están al día." />
      ) : (
        <>
          {overduePage.length > 0 ? (
            <>
              <Text
                size="xs"
                weight="bold"
                className="uppercase tracking-widest text-slate-500 pt-2"
              >
                Vencidas · {overdueCount}
              </Text>
              {overduePage.map((item) => (
                <RenewalRow
                  key={item.org.id}
                  item={item}
                  href={orgHref(item.org.slug, item.org.id)}
                />
              ))}
            </>
          ) : null}
          {expiringPage.length > 0 ? (
            <>
              <Text
                size="xs"
                weight="bold"
                className="uppercase tracking-widest text-slate-500 pt-2"
              >
                Por vencer · {expiringCount}
              </Text>
              {expiringPage.map((item) => (
                <RenewalRow
                  key={item.org.id}
                  item={item}
                  href={orgHref(item.org.slug, item.org.id)}
                />
              ))}
            </>
          ) : null}
        </>
      )}
    </WidgetCard>
  );
}
