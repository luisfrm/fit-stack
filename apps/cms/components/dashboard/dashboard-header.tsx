"use client";

import * as React from "react";
import * as Icons from "lucide-react";
import { Text } from "@workspace/ui/components/text";

interface DashboardHeaderProps {
  readonly title: React.ReactNode;
  readonly description: string;
  readonly iconName: keyof typeof Icons;
  readonly children?: React.ReactNode;
}

/**
 * Reusable header for all CMS dashboard pages.
 * Ensures consistent layout, typography, and iconography.
 */
export function DashboardHeader({ title, description, iconName, children }: DashboardHeaderProps) {
  const Icon = Icons[iconName] as React.ElementType;

  return (
    <header className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 mb-10 animate-in fade-in slide-in-from-top-4 duration-500">
      <div className="flex-1">
        <h1 className="text-2xl lg:text-3xl font-bold tracking-tighter text-foreground flex gap-3 items-center uppercase italic">
          {Icon && <Icon className="text-primary w-8 h-8 shrink-0" />}
          <div className="leading-tight">
            {title}
          </div>
        </h1>
        <Text variant="muted" className="mt-2 max-w-2xl text-sm md:text-base leading-relaxed opacity-80">
          {description}
        </Text>
      </div>

      <div className="flex items-center gap-3 w-full md:w-auto justify-start md:justify-end">
        {children}
      </div>
    </header>
  );
}
