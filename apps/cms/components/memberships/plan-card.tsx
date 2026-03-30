"use client";

import * as React from "react";
import { type IMembershipPlan } from "@/types/dashboard";
import { Card, Text, Button, Checkbox, Title } from "@workspace/ui/components";
import { CheckCircle2, Eye, EyeOff } from "lucide-react";
import { cn } from "@workspace/ui/lib/utils";
import { PlanModal } from "@/components/memberships/plan-modal";

interface PlanCardProps {
  readonly plan: IMembershipPlan;
  readonly onUpdate: () => void;
  // This could be calculated from total subscriptions grouped by plan, 
  // currently we just mock it to 0 or accept it if provided
  readonly activeMembersCount?: number; 
}

export function PlanCard({ plan, onUpdate, activeMembersCount = 0 }: PlanCardProps) {
  const isDraft = !plan.isVisibleOnSite;
  const priceFormatted = new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(plan.price / 100);

  return (
    <Card 
      className={cn(
        "relative flex flex-col p-6 rounded-2xl border-2 transition-all overflow-hidden",
        plan.isPopular 
          ? "bg-zinc-900 border-primary" 
          : "bg-zinc-900/50 border-white/5 hover:border-white/10"
      )}
    >
      {/* Etiqueta Popular */}
      {plan.isPopular && (
        <div className="absolute top-0 right-0 bg-primary text-black text-[10px] font-bold tracking-widest px-8 py-1 uppercase transform translate-x-10 translate-y-4 rotate-45 shadow-lg">
          Popular
        </div>
      )}

      {/* Cabecera */}
      <div className="flex items-start justify-between mb-2 z-10">
        <div className="flex flex-col">
          <Text as="span" size="xs" variant="muted" className="uppercase tracking-widest text-[#B3A9A3] mb-1">
            Nivel de Suscripción
          </Text>
          <Title as="h3" size="sm" className="uppercase text-white leading-none">
            {plan.name}
          </Title>
        </div>
        <div className="flex flex-col items-center gap-1 mt-1">
          <Checkbox 
            checked={plan.isVisibleOnSite} 
            disabled 
          />
          <Text as="span" size="xs" className="text-white/40 text-[9px] uppercase">
            {plan.isVisibleOnSite ? "Visible" : "Borrador"}
          </Text>
        </div>
      </div>

      {/* Precio */}
      <div className="flex items-baseline gap-1 my-6">
        <Text as="p" className="text-4xl font-extrabold text-white">
          {priceFormatted}
        </Text>
        <Text as="span" size="sm" variant="muted" className="text-white/50">
          /mes
        </Text>
      </div>

      {/* Módulo de Features (Lista de Checks) */}
      <div className="flex flex-col gap-3 mb-8 flex-1">
        {plan.features?.map((feature, i) => (
          <div key={i} className="flex items-start gap-3">
            <CheckCircle2 className="w-5 h-5 text-primary shrink-0" />
            <Text as="span" size="sm" className="text-white/80 leading-tight">
              {feature}
            </Text>
          </div>
        ))}
      </div>

      {/* Indicador de Miembros Activos */}
      <div className={cn(
        "flex items-center justify-between px-4 py-3 rounded-xl mb-6",
        plan.isPopular ? "bg-primary/10" : "bg-black/20"
      )}>
        <Text as="span" size="xs" className="uppercase tracking-widest text-slate-400 font-bold">
          Miembros Activos
        </Text>
        <Text as="span" weight="bold" className={plan.isPopular ? "text-primary" : "text-white"}>
          {activeMembersCount}
        </Text>
      </div>

      {/* Botonera Inferior */}
      <div className="flex items-center gap-2 mt-auto">
        <PlanModal 
          planData={plan} 
          onSuccess={onUpdate}
          trigger={
            <Button 
              className={cn(
                "flex-1 uppercase font-bold tracking-wider py-6",
                plan.isPopular 
                  ? "bg-primary text-black hover:bg-primary/90" 
                  : "bg-white/5 text-white hover:bg-white/10"
              )}
            >
              Editar Plan
            </Button>
          }
        />
        <Button 
          variant="outlined" 
          size="icon" 
          className="h-12 w-12 shrink-0 border-white/10 hover:bg-white/5 bg-transparent"
        >
          {plan.isVisibleOnSite ? (
            <Eye className="w-5 h-5 text-slate-400" />
          ) : (
            <EyeOff className="w-5 h-5 text-slate-500" />
          )}
        </Button>
      </div>
    </Card>
  );
}
