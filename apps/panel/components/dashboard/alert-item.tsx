"use client";

import {
  AlertTriangle,
  AlertCircle,
  BadgeCheck,
  type LucideIcon,
} from "lucide-react";

import { Card, Text, Button } from "@workspace/ui/components";
import { cn } from "@workspace/ui/lib/utils";

export type AlertSeverity = "warning" | "danger" | "success" | "info";

const ALERT_CONFIG: Record<AlertSeverity, { borderClass: string; iconBg: string; iconClass: string; buttonClass: string; icon: LucideIcon }> = {
  warning: { icon: AlertTriangle, borderClass: "border-l-primary", iconBg: "bg-primary/20", iconClass: "text-primary", buttonClass: "text-primary" },
  danger: { icon: AlertCircle, borderClass: "border-l-destructive", iconBg: "bg-destructive/20", iconClass: "text-destructive", buttonClass: "text-destructive" },
  success: { icon: BadgeCheck, borderClass: "border-l-success", iconBg: "bg-success/20", iconClass: "text-success", buttonClass: "text-success" },
  info: { icon: AlertCircle, borderClass: "border-l-info", iconBg: "bg-info/20", iconClass: "text-info", buttonClass: "text-info" },
};

interface AlertItemProps {
  severity: AlertSeverity;
  title: string;
  description: string;
  actionLabel: string;
}

export function AlertItem({ severity, title, description, actionLabel }: Readonly<AlertItemProps>) {
  const config = ALERT_CONFIG[severity];
  const Icon = config.icon;
  return (
    <Card
      className={cn(
        "flex-1 min-w-[300px] p-4! rounded-xl",
        "flex flex-row items-center gap-4 border-l-4",
        config.borderClass
      )}
    >
      <div className={cn("w-10 h-10 rounded-full flex items-center justify-center shrink-0", config.iconBg)}>
        <Icon className={cn("w-5 h-5", config.iconClass)} />
      </div>
      <div className="flex-1 min-w-0">
        <Text as="p" size="base" weight="semibold">{title}</Text>
        <Text as="p" size="xs" variant="subtle">{description}</Text>
      </div>
      <Button
        variant="link"
        size="xs"
        className={cn("ml-auto shrink-0", config.buttonClass)}
      >
        {actionLabel}
      </Button>
    </Card>
  );
}