"use client";

import * as React from "react";
import { UserMinus } from "lucide-react";

import { Text } from "@workspace/ui/components";
import { Card } from "@workspace/ui/components/card";
import { NoData } from "./no-data";
import {
  MemberDeadlineRow,
  type MemberDeadlineItem,
} from "./member-deadline-row";

interface RecentlyExpiredListProps {
  items: MemberDeadlineItem[];
  loading?: boolean;
}

export function RecentlyExpiredList({ items, loading }: Readonly<RecentlyExpiredListProps>) {
  const skeletonIds = React.useMemo(
    () => Array.from({ length: 4 }, (_, i) => `rex-sk-${i}`),
    [],
  );

  return (
    <Card>
      <div className="p-6 border-b border-border flex justify-between items-center">
        <Text as="p" size="lg" weight="bold">
          Vencidos Recientemente
        </Text>
        <Text as="span" size="xs" variant="muted" className="flex items-center gap-1">
          <UserMinus size={12} />
          últimos 7 días
        </Text>
      </div>
      {loading ? (
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
      ) : items.length === 0 ? (
        <NoData
          message="Nadie ha dejado vencer su membresía en los últimos 7 días."
          className="py-12 flex-1"
        />
      ) : (
        <div className="flex flex-col flex-1 p-2 gap-1 animate-in fade-in duration-500">
          {items.map((item) => (
            <MemberDeadlineRow
              key={item.memberId}
              item={item}
              badgeLabel={`vencido hace ${Math.abs(item.days)} día${Math.abs(item.days) === 1 ? "" : "s"}`}
              badgeVariant="destructive"
            />
          ))}
        </div>
      )}
    </Card>
  );
}
