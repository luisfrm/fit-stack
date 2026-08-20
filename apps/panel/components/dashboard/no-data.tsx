"use client";

import { Inbox, type LucideIcon } from "lucide-react";

import { Text } from "@workspace/ui/components";
import { cn } from "@workspace/ui/lib/utils";

interface NoDataProps {
  message: string;
  className?: string;
  icon?: LucideIcon;
}

export function NoData({ message, className, icon: Icon = Inbox }: Readonly<NoDataProps>) {
  return (
    <div className={cn("flex flex-col items-center p-12 text-center gap-3", className)}>
      <div className="w-12 h-12 rounded-full bg-foreground/5 flex items-center justify-center mb-1">
        <Icon className="w-6 h-6 text-foreground-dim" />
      </div>
      <Text variant="muted" size="sm">
        {message}
      </Text>
    </div>
  );
}