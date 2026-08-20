"use client";

import * as React from "react";

import { type IRecentRegistration } from "@/types/dashboard";
import { NoData } from "./no-data";
import { ActivityItem } from "./activity-item";

export function RecentRegistrationsList({ registrations, loading }: Readonly<{ registrations: IRecentRegistration[]; loading?: boolean }>) {
  const skeletonIds = React.useMemo(() => Array.from({ length: 5 }, (_, i) => `reg-sk-${i}-${Math.random().toString(36).slice(2, 7)}`), []);

  if (loading) {
    return (
      <div className="flex flex-col flex-1 p-2 gap-1">
        {skeletonIds.map((id) => (
          <div key={id} className="flex items-center gap-3 p-3 rounded-lg animate-pulse">
            <div className="w-10 h-10 rounded-full bg-foreground/10 shrink-0" />
            <div className="flex-1 space-y-2 py-1">
              <div className="h-4 bg-foreground/10 rounded w-2/3" />
              <div className="h-3 bg-foreground/5 rounded w-1/3" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (registrations.length === 0) {
    return <NoData message="No hay pagos registrados recientemente." className="py-12" />;
  }

  return (
    <div className="flex flex-col flex-1 p-2 gap-1 animate-in fade-in duration-500">
      {registrations.map((member) => (
        <ActivityItem key={member.id} {...member} />
      ))}
    </div>
  );
}