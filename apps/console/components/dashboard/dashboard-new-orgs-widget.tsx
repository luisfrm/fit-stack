"use client";

import * as React from "react";
import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { Text } from "@workspace/ui/components";
import { COUNTRIES } from "@workspace/shared/constants";
import type { IPlatformOrganization } from "@workspace/shared/types";
import { DASHBOARD_WIDGET_PAGE_SIZE } from "@/lib/dashboard/selectors";
import {
  formatShortDate,
  OrgAvatar,
  WidgetCard,
  WidgetEmpty,
} from "./dashboard-widget-card";
import { WidgetPagination } from "./dashboard-widget-pagination";

export function NewOrgsWidget({
  orgs,
}: {
  readonly orgs: IPlatformOrganization[];
}) {
  const [page, setPage] = React.useState(1);
  const totalPages = Math.max(
    1,
    Math.ceil(orgs.length / DASHBOARD_WIDGET_PAGE_SIZE),
  );
  const safePage = Math.min(page, totalPages);
  const pageItems = orgs.slice(
    (safePage - 1) * DASHBOARD_WIDGET_PAGE_SIZE,
    safePage * DASHBOARD_WIDGET_PAGE_SIZE,
  );

  return (
    <WidgetCard
      id="dashboard-new-orgs"
      isEmpty={orgs.length === 0}
      title="Gimnasios nuevos este mes"
      count={orgs.length}
      description="Altas del mes calendario actual."
      viewAllHref="/organizations"
      footer={
        <WidgetPagination
          id="dashboard-new-orgs-pagination"
          page={safePage}
          totalPages={totalPages}
          onPageChange={setPage}
        />
      }
    >
      {orgs.length === 0 ? (
        <WidgetEmpty message="Sin altas este mes." />
      ) : (
        pageItems.map((org) => (
          <Link
            key={org.id}
            id={`dashboard-new-orgs-row-${org.id}`}
            href={`/organizations/${org.slug ?? org.id}/subscriptions`}
            title={`Ver ${org.name}`}
            className="flex items-center gap-3 py-3 border-b border-white/5 last:border-b-0 transition-colors hover:bg-white/[0.03]"
          >
            <OrgAvatar name={org.name} />
            <div className="flex flex-col min-w-0 flex-1">
              <Text size="sm" weight="bold" className="truncate">
                {org.name}
              </Text>
              <Text size="xs" variant="muted" className="truncate">
                {COUNTRIES[org.countryCode || ""]?.name ||
                  org.countryCode ||
                  "Global"}{" "}
                · alta {org.createdAt ? formatShortDate(org.createdAt) : "—"}
              </Text>
            </div>
            <ChevronRight size={14} className="text-foreground/50 shrink-0" aria-hidden />
          </Link>
        ))
      )}
    </WidgetCard>
  );
}
