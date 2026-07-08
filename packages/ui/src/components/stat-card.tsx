"use client";

import * as React from "react";
import { Card, Text } from "@workspace/ui/components";

interface StatCardProps {
  readonly title: string;
  readonly value: string;
  readonly change?: string;
  readonly icon: React.ReactNode;
  readonly status?: "online" | "offline";
  readonly children?: React.ReactNode;
}

export function StatCard({ title, value, change, icon, status, children }: StatCardProps) {
  return (
    <Card className="p-6 hover:bg-foreground/8 transition-all">
      <div className="flex justify-between items-start mb-4">
        {icon}
        {status === 'online' && (
          <div className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-success animate-pulse" />
            <span className="text-[10px] font-bold text-success uppercase tracking-wider">Online</span>
          </div>
        )}
      </div>
      <div>
        <Text variant="muted" size="xs" weight="bold" uppercase className="mb-1 tracking-widest">{title}</Text>
        {value && <Text size="lg" weight="bold" className="mb-1">{value}</Text>}
        {change && <Text size="xs" className="text-success font-medium">{change}</Text>}
        {children}
      </div>
    </Card>
  );
}
