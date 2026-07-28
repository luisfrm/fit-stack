"use client";

import * as React from "react";
import { KpiCard } from "./dashboard-ui";

interface KpiItem {
  label: string;
  value: React.ReactNode;
  icon: "users" | "wallet" | "calendar" | "alert" | "trendingUp" | "trendingDown" | "inbox";
  trend?: { value: string; direction: "up" | "down" | "neutral" };
  accent?: boolean;
}

interface KpiGroupProps {
  readonly items: KpiItem[];
  readonly loading?: boolean;
}

export function KpiGroup({ items, loading }: KpiGroupProps) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-6 mb-10">
      {items.map((item) => (
        <KpiCard
          key={item.label}
          label={item.label}
          value={loading ? "—" : item.value}
          icon={item.icon}
          trend={item.trend}
          accent={item.accent}
        />
      ))}
    </div>
  );
}
