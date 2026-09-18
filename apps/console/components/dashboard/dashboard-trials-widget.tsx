"use client";

import * as React from "react";
import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { Badge, Button, Text } from "@workspace/ui/components";
import {
  DASHBOARD_WIDGET_PAGE_SIZE,
  type TrialsSelection,
} from "@/lib/dashboard/selectors";
import { OrgAvatar, WidgetCard, WidgetEmpty } from "./dashboard-widget-card";
import { formatShortDate } from "@workspace/shared";
import { WidgetPagination } from "./dashboard-widget-pagination";

type TrialsFilter = "expiring" | "all";

const FILTER_OPTIONS: { readonly id: TrialsFilter; readonly label: string }[] =
  [
    { id: "expiring", label: "Por vencer" },
    { id: "all", label: "Todos" },
  ];

export function TrialsWidget({ trials }: { readonly trials: TrialsSelection }) {
  const [filter, setFilter] = React.useState<TrialsFilter>("expiring");
  const [page, setPage] = React.useState(1);

  const items = filter === "expiring" ? trials.expiring : trials.all;
  const totalPages = Math.max(
    1,
    Math.ceil(items.length / DASHBOARD_WIDGET_PAGE_SIZE),
  );
  const safePage = Math.min(page, totalPages);
  const pageItems = items.slice(
    (safePage - 1) * DASHBOARD_WIDGET_PAGE_SIZE,
    safePage * DASHBOARD_WIDGET_PAGE_SIZE,
  );

  const setTrialsFilter = (next: TrialsFilter) => {
    setFilter(next);
    setPage(1);
  };

  return (
    <WidgetCard
      id="dashboard-trials"
      isEmpty={items.length === 0}
      title="Trials"
      count={filter === "expiring" ? trials.expiring.length : trials.all.length}
      description="Trials por convertir a plan de pago."
      viewAllHref="/subscriptions?status=trial"
      action={
        <div className="flex items-center gap-2">
          {FILTER_OPTIONS.map((option) => (
            <Button
              key={option.id}
              id={`dashboard-trials-filter-${option.id}`}
              size="sm"
              variant={filter === option.id ? "primary" : "glass"}
              className="font-medium normal-case tracking-normal"
              onClick={() => setTrialsFilter(option.id)}
            >
              {option.label}
            </Button>
          ))}
        </div>
      }
      footer={
        <WidgetPagination
          id="dashboard-trials-pagination"
          page={safePage}
          totalPages={totalPages}
          onPageChange={setPage}
        />
      }
    >
      {items.length === 0 ? (
        <WidgetEmpty
          message={
            filter === "expiring"
              ? "Sin trials por vencer en 7 días."
              : "Sin trials activos."
          }
        />
      ) : (
        pageItems.map((item) => (
          <Link
            key={item.org.id}
            id={`dashboard-trials-row-${item.org.id}`}
            href={`/organizations/${item.org.slug ?? item.org.id}`}
            title={`Ver ${item.org.name}`}
            className="flex items-center gap-3 py-3 border-b border-white/5 last:border-b-0 transition-colors hover:bg-white/[0.03]"
          >
            <OrgAvatar name={item.org.name} />
            <div className="flex flex-col min-w-0 flex-1">
              <Text size="sm" weight="bold" className="truncate">
                {item.org.name}
              </Text>
              <Text size="xs" variant="muted" className="truncate">
                {item.org.latestSubscription?.planName ?? "Trial"} · fin{" "}
                {formatShortDate(item.periodEnd)}
              </Text>
            </div>
            <Badge
              variant="info"
              className="uppercase text-[9px] font-bold tracking-widest shrink-0"
            >
              Trial
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
