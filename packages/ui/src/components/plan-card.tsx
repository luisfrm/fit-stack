"use client";

import * as React from "react";
import { CheckCircle2 } from "lucide-react";
import { cn } from "@workspace/ui/lib/utils";
import { Card } from "./card";
import { Text } from "./text";
import { Title } from "./title";

export interface PlanCardProps {
  readonly plan: {
    id?: number;
    name: string;
    price: number;
    currency: string;
    features: string[] | null;
    isPopular?: boolean;
    isActive?: boolean;
    isVisibleOnSite?: boolean;
  };
  readonly activeMembersCount?: number;
  readonly footer?: React.ReactNode;
  readonly statusBadge?: React.ReactNode;
  readonly headerExtra?: React.ReactNode;
  readonly className?: string;
  readonly showMembersCount?: boolean;
}

export function PlanCard({
  plan,
  activeMembersCount = 0,
  footer,
  statusBadge,
  headerExtra,
  className,
  showMembersCount = false,
}: PlanCardProps) {
  const priceFormatted = new Intl.NumberFormat("es-VE", {
    style: "currency",
    currency: plan.currency || "USD",
  }).format(plan.price / 100);

  return (
    <Card 
      className={cn(
        "relative flex flex-col p-6 rounded-2xl border-2 transition-all overflow-hidden bg-zinc-900 h-full",
        plan.isPopular 
          ? "border-primary shadow-lg shadow-primary/5" 
          : "border-white/5 hover:border-white/10",
        className
      )}
    >
      {/* Etiqueta Popular */}
      {plan.isPopular && (
        <div className="absolute top-0 right-0 bg-primary text-black text-[10px] font-bold tracking-widest px-8 py-1 uppercase transform translate-x-10 translate-y-4 rotate-45 shadow-lg z-20">
          Popular
        </div>
      )}

      {/* Cabecera */}
      <div className="flex items-start justify-between mb-2 z-10">
        <div className="flex flex-col">
          <Text as="span" size="xs" variant="muted" className="uppercase tracking-widest text-slate-500 mb-1 font-bold text-[9px]">
            Nivel de Suscripción
          </Text>
          <Title as="h3" size="sm" className="uppercase text-white leading-none font-black tracking-tighter">
            {plan.name}
          </Title>
        </div>
        <div className="flex flex-col items-end gap-1.5 mt-1">
          <div className="flex items-center gap-2">
            {statusBadge}
            {headerExtra}
          </div>
        </div>
      </div>

      {/* Precio */}
      <div className="flex items-end gap-2 my-8">
        <Text as="p" className="text-4xl font-black text-white tracking-tighter leading-none">
          {priceFormatted}
        </Text>
        <div className="flex flex-col mb-1">
          <Text as="span" size="xs" className="text-primary font-bold uppercase leading-none mb-0.5 text-[10px]">
            {plan.currency}
          </Text>
          <Text as="span" size="xs" variant="muted" className="text-white/30 uppercase text-[9px] font-bold leading-none">
            /mes
          </Text>
        </div>
      </div>

      {/* Módulo de Features (Lista de Checks) */}
      <div className="flex flex-col gap-3 mb-8 flex-1">
        {plan.features?.map((feature, i) => (
          <div key={`${plan.id || i}-${feature.substring(0, 5)}`} className="flex items-center gap-3">
            <CheckCircle2 className="w-4 h-4 text-primary shrink-0 opacity-80" />
            <Text as="span" size="sm" className="text-white/70 leading-none font-medium">
              {feature}
            </Text>
          </div>
        ))}
      </div>

      {/* Indicador de Miembros Activos (Opcional) */}
      {showMembersCount && (
        <div className={cn(
          "flex items-center justify-between px-4 py-3 rounded-xl mb-6 border border-white/5",
          plan.isPopular ? "bg-primary/5 border-primary/10" : "bg-black/20"
        )}>
          <Text as="span" size="xs" className="uppercase tracking-widest text-slate-500 font-black text-[9px]">
            Miembros
          </Text>
          <Text as="span" weight="bold" className={plan.isPopular ? "text-primary" : "text-white"}>
            {activeMembersCount}
          </Text>
        </div>
      )}

      {/* Botonera Inferior (Inyectada desde el exterior) */}
      {footer && (
        <div className="flex items-center gap-2 mt-auto">
          {footer}
        </div>
      )}
    </Card>
  );
}
