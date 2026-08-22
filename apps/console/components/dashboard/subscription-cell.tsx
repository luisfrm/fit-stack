"use client";

import { Badge, Skeleton, Text } from "@workspace/ui/components";
import { format } from "date-fns";
import { es } from "date-fns/locale";

interface ISubscriptionLite {
  status: string;
  planName?: string | null;
  isTrial?: boolean;
  currentPeriodEnd: string | Date;
}

interface SubscriptionCellProps {
  readonly subscription: ISubscriptionLite | null | undefined;
  readonly isLoading?: boolean;
}

const STATUS_VARIANTS: Record<
  string,
  "success" | "warning" | "destructive" | "info" | "default"
> = {
  active: "success",
  trial: "info",
  past_due: "warning",
  read_only: "default",
  suspended: "destructive",
  cancelled: "destructive",
};

export function SubscriptionCell({ subscription, isLoading }: SubscriptionCellProps) {
  if (isLoading) {
    return (
      <div className="flex flex-col gap-2">
        <Skeleton className="h-5 w-24 rounded-full" />
        <Skeleton className="h-3 w-32" />
      </div>
    );
  }

  if (!subscription) {
    return (
      <div className="flex flex-col gap-0.5">
        <Text size="xs" weight="bold" className="text-amber-500/80 uppercase tracking-widest italic">
          Sin Suscripción
        </Text>
        <Text size="xs" variant="muted" className="opacity-40">
          No hay planes vinculados.
        </Text>
      </div>
    );
  }

  const isExpired = new Date(subscription.currentPeriodEnd) < new Date();

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center gap-2">
        <Badge
          variant={STATUS_VARIANTS[subscription.status] || "default"}
          className="uppercase text-[9px] font-black tracking-tighter h-5 px-2"
        >
          {subscription.planName || "Plan Personalizado"}
        </Badge>
        {subscription.isTrial && (
          <Badge variant="info" className="uppercase text-[9px] font-black tracking-tighter h-5">
            Prueba
          </Badge>
        )}
      </div>
      <Text size="xs" className="text-slate-500 font-medium">
        {isExpired ? "Expiró: " : "Expira: "}
        <span className={isExpired ? "text-rose-500 font-bold" : "text-slate-300 font-bold"}>
          {format(new Date(subscription.currentPeriodEnd), "dd MMM yyyy", { locale: es })}
        </span>
      </Text>
    </div>
  );
}
