"use client";

import * as React from "react";
import { 
  Label, 
  ToggleGroup, 
  ToggleGroupItem 
} from "@workspace/ui/components";
import { type IMembershipPlan } from "@/types/dashboard";

interface PlanSelectorProps {
  readonly plans: IMembershipPlan[];
  readonly planId: number | null;
  readonly onPlanSelect: (id: number) => void;
}

export function PlanSelector({
  plans,
  planId,
  onPlanSelect,
}: PlanSelectorProps) {
  return (
    <div className="space-y-3">
      <Label id="plan-selection-label" className="text-sm font-medium">Plan de Membresía</Label>
      {plans.length === 0 ? (
        <p className="text-sm text-yellow-500 bg-yellow-500/10 p-3 rounded-lg">
          Carga planes primero en el módulo de Membresías.
        </p>
      ) : (
        <ToggleGroup
          type="single"
          value={planId ? String(planId) : ""}
          aria-labelledby="plan-selection-label"
          onValueChange={(val) => {
            if (val) onPlanSelect(Number(val));
          }}
          className="flex flex-wrap gap-2 justify-start"
        >
          {plans.filter(p => p.isActive).map(plan => (
            <ToggleGroupItem
              key={plan.id}
              value={String(plan.id)}
              className="rounded-xl border border-white/5 data-[state=on]:bg-primary data-[state=on]:text-black h-auto py-3 px-4 flex flex-col items-start gap-1"
            >
              <div className="flex items-center justify-between w-full gap-4">
                <span className="font-bold text-sm uppercase">{plan.name}</span>
                <span className="text-[10px] font-bold bg-white/10 px-1.5 py-0.5 rounded uppercase">{plan.currency}</span>
              </div>
              <span className="text-xs opacity-80">{plan.price / 100} {plan.currency}/mes</span>
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
      )}
    </div>
  );
}
