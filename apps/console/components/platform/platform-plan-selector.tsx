"use client";

import * as React from "react";
import {
  Label,
  ToggleGroup,
  ToggleGroupItem,
  Text
} from "@workspace/ui/components";
import { type IPlatformPlan } from "@workspace/shared/types";
import { cn } from "@workspace/ui/lib/utils";

interface PlatformPlanSelectorProps {
  readonly plans: IPlatformPlan[];
  readonly planId: number | null;
  readonly onPlanSelect: (id: number) => void;
  readonly disabled?: boolean;
}

function getPlanDurationLabel(plan: IPlatformPlan) {
  const { durationValue: v, durationUnit: u } = plan;
  const unitMap: Record<string, { singular: string; plural: string }> = {
    day: { singular: "día", plural: "días" },
    week: { singular: "semana", plural: "semanas" },
    month: { singular: "mes", plural: "meses" },
    year: { singular: "año", plural: "años" },
  };
  const unit = unitMap[u] || { singular: u, plural: `${u}s` };
  return v === 1 ? unit.singular : `${v} ${unit.plural}`;
}

export function PlatformPlanSelector({
  plans,
  planId,
  onPlanSelect,
  disabled,
}: PlatformPlanSelectorProps) {
  return (
    <div className={cn("space-y-3", disabled && "opacity-40 cursor-not-allowed transition-opacity")}>
      <Label id="plan-selection-label" className="text-sm font-medium">Plan de Suscripción</Label>
      {plans.length === 0 ? (
        <p className="text-sm text-warning bg-warning/10 p-3 rounded-lg">
          No hay planes disponibles. Crea uno en el módulo de Planes.
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
              disabled={disabled}
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
                {Number(plan.price) / 100} {plan.currency}/{getPlanDurationLabel(plan)}
              </Text>
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
      )}
    </div>
  );
}
