"use client";

import * as React from "react";
import { 
  Label, 
  ToggleGroup, 
  ToggleGroupItem,
  Text
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
              className="rounded-xl border border-border data-[state=on]:bg-primary data-[state=on]:text-primary-foreground h-auto py-3 px-4 flex flex-col items-start gap-1 transition-all duration-300 hover:border-primary/50"
            >
              <div className="flex items-center justify-between w-full gap-4">
                <Text size="base" weight="bold" uppercase as="span">
                  {plan.name}
                </Text>
                <Text size="xs" weight="bold" className="bg-muted px-1.5 py-0.5 rounded uppercase" as="span">
                  {plan.currency}
                </Text>
              </div>
              <Text size="sm" variant="muted">
                {plan.price / 100} {plan.currency}/mes
              </Text>
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
      )}
    </div>
  );
}
