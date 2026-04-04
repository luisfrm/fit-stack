"use client";

import * as React from "react";
import { Label, ToggleGroup, ToggleGroupItem } from "@workspace/ui/components";

interface StatusSelectorProps {
  readonly status: "active" | "canceled";
  readonly onStatusChange: (status: "active" | "canceled") => void;
}

export function StatusSelector({ status, onStatusChange }: StatusSelectorProps) {
  return (
    <div className="space-y-2">
      <Label id="status-selection-label" className="text-sm font-semibold text-white/50 uppercase tracking-widest text-[10px]">
        Estado del Alta
      </Label>
      <ToggleGroup
        type="single"
        value={status}
        aria-labelledby="status-selection-label"
        onValueChange={(v) => {
          if (v === "active" || v === "canceled") onStatusChange(v as any);
        }}
        className="flex gap-2"
      >
        <ToggleGroupItem
          value="active"
          className="flex-1 rounded-xl h-11 border border-white/5 data-[state=on]:bg-primary data-[state=on]:text-black font-bold transition-all uppercase tracking-widest text-xs"
        >
          ACTIVO
        </ToggleGroupItem>
        <ToggleGroupItem
          value="canceled"
          className="flex-1 rounded-xl h-11 border border-white/5 data-[state=on]:bg-red-500/10 data-[state=on]:text-red-500 font-bold transition-all uppercase tracking-widest text-xs"
        >
          INACTIVO
        </ToggleGroupItem>
      </ToggleGroup>
    </div>
  );
}
