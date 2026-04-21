"use client";

import * as React from "react";
import { Card, CardContent, CardHeader, CardTitle, SimpleTooltip } from "@workspace/ui/components";
import { cn } from "@workspace/ui/lib/utils";
import type { LucideIcon } from "lucide-react";

interface KpiCardProps {
  title: string;
  value: string;
  description: string;
  icon: LucideIcon;
  iconClassName?: string;
  isActive?: boolean;
  isTicker?: boolean;
  filterId?: string;
  onFilterChange?: (filter: string | null) => void;
  tooltipContent?: React.ReactNode;
}

export function KpiCard({
  title,
  value,
  description,
  icon: Icon,
  iconClassName,
  isActive,
  isTicker,
  filterId,
  onFilterChange,
  tooltipContent,
}: Readonly<KpiCardProps>) {
  const isClickable = filterId !== undefined;

  const content = (
    <Card
      className={cn(
        "select-none transition-all",
        isClickable && "cursor-pointer hover:border-white/20 hover:bg-white/8",
        !isClickable && "cursor-default",
        isActive && "border-primary/50 bg-primary/5 ring-1 ring-primary/20"
      )}
      onClick={() => isClickable && onFilterChange?.(isActive ? null : filterId)}
    >
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium">{title}</CardTitle>
        <Icon className={cn("h-4 w-4", iconClassName)} />
      </CardHeader>
      <CardContent>
        {isTicker ? (
          <div className="relative group/ticker overflow-hidden">
            <div className="text-xl font-bold truncate whitespace-nowrap mask-fade-right">
              {value}
            </div>
          </div>
        ) : (
          <div className="text-2xl font-bold">{value}</div>
        )}
        <p className="text-xs text-muted-foreground mt-1">
          {description}
        </p>
      </CardContent>
    </Card>
  );

  if (tooltipContent) {
    return (
      <SimpleTooltip side="bottom" content={tooltipContent}>
        {content}
      </SimpleTooltip>
    );
  }

  return content;
}
