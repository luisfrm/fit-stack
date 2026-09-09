import * as React from "react";
import Link from "next/link";
import { Building2 } from "lucide-react";
import { Badge, Button, Card, Text } from "@workspace/ui/components";

export function formatShortDate(value: string | Date): string {
  return new Date(value).toLocaleDateString("es-ES", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

export function OrgAvatar({ name }: { readonly name: string }) {
  return (
    <div
      className="w-9 h-9 rounded-lg bg-primary/10 border border-primary/20 flex items-center justify-center text-primary shrink-0"
      title={name}
    >
      <Building2 size={16} />
    </div>
  );
}

export function WidgetEmpty({ message }: { readonly message: string }) {
  return (
    <Text
      size="sm"
      variant="muted"
      className="flex flex-1 items-center justify-center py-10 text-center"
    >
      {message}
    </Text>
  );
}

interface WidgetCardProps {
  readonly id: string;
  readonly title: string;
  readonly count: number;
  readonly description?: string;
  readonly viewAllHref?: string;
  readonly viewAllLabel?: string;
  readonly action?: React.ReactNode;
  readonly children: React.ReactNode;
  readonly footer?: React.ReactNode;
  /** Sin filas: el cuerpo toma su tamaño natural en vez de la altura fija. */
  readonly isEmpty?: boolean;
}

export function WidgetCard({
  id,
  title,
  count,
  description,
  viewAllHref,
  viewAllLabel = "Ver todo",
  action,
  children,
  footer,
  isEmpty = false,
}: WidgetCardProps) {
  return (
    <Card id={id} className="p-6 flex flex-col gap-2 overflow-hidden">
      <div className="flex items-start justify-between gap-3">
        <div className="space-y-1 min-w-0">
          <div className="flex items-center gap-2">
            <Text as="p" size="lg" weight="bold" className="truncate">
              {title}
            </Text>
            <Badge variant="outline" className="tabular-nums shrink-0">
              {count}
            </Badge>
          </div>
          {description ? (
            <Text size="xs" variant="muted">
              {description}
            </Text>
          ) : null}
        </div>
        {viewAllHref ? (
          <Button
            asChild
            variant="ghost"
            size="sm"
            className="text-primary font-bold hover:bg-primary/5 shrink-0"
          >
            <Link href={viewAllHref}>{viewAllLabel}</Link>
          </Button>
        ) : null}
      </div>

      {action}

      <div
        id={`${id}-rows`}
        className={
          isEmpty
            ? "flex flex-col flex-1"
            : "flex flex-col overflow-y-auto h-[380px] pr-1"
        }
      >
        {children}
      </div>

      {footer}
    </Card>
  );
}
