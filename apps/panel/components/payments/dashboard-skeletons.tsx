"use client";

import { Card, CardContent, CardHeader, Skeleton } from "@workspace/ui/components";

const KPI_SKELETONS = ["kpi-total-revenue", "kpi-subscriptions", "kpi-active-members", "kpi-churn-rate"];

export function KpiSectionSkeleton() {
  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
      {KPI_SKELETONS.map((id) => (
        <Card key={id} variant="glass">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-4 w-4 rounded-full" />
          </CardHeader>
          <CardContent className="space-y-2">
            <Skeleton className="h-8 w-32" />
            <Skeleton className="h-3 w-40" />
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

const CHART_BARS = [
  { id: "jan", h: 20 }, { id: "feb", h: 35 }, { id: "mar", h: 25 }, 
  { id: "apr", h: 45 }, { id: "may", h: 60 }, { id: "jun", h: 40 }, 
  { id: "jul", h: 75 }, { id: "aug", h: 55 }, { id: "sep", h: 65 }, 
  { id: "oct", h: 80 }, { id: "nov", h: 50 }, { id: "dec", h: 70 }
];

export function RevenueChartSkeleton() {
  return (
    <Card variant="glass" className="w-1/2">
      <CardHeader className="flex flex-row items-center justify-between pb-8">
        <div className="space-y-2">
          <Skeleton className="h-5 w-48" />
          <Skeleton className="h-4 w-64" />
        </div>
        <div className="flex gap-2">
          <Skeleton className="h-8 w-24" />
          <Skeleton className="h-8 w-8" />
          <Skeleton className="h-8 w-8" />
        </div>
      </CardHeader>
      <CardContent>
        <div className="h-[300px] flex items-end gap-2 pb-4">
          {CHART_BARS.map((bar) => (
            <Skeleton
              key={bar.id}
              className="flex-1"
              style={{ height: `${bar.h}%` }}
            />
          ))}
        </div>
        <div className="flex justify-center gap-4 pt-4 border-t border-white/5">
          <Skeleton className="h-3 w-16" />
          <Skeleton className="h-3 w-16" />
          <Skeleton className="h-3 w-16" />
        </div>
      </CardContent>
    </Card>
  );
}
