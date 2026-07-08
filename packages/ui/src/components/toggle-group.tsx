"use client";

import * as React from "react";
import { cn } from "@workspace/ui/lib/utils";

type ToggleGroupType = "single" | "multiple";

interface ToggleGroupContextValue {
  readonly type: ToggleGroupType;
  readonly value: string | number | (string | number)[];
  readonly onValueChange: (value: string | number | (string | number)[]) => void;
}

const ToggleGroupContext = React.createContext<ToggleGroupContextValue | null>(null);

export interface ToggleGroupProps<T extends string | number> extends React.HTMLAttributes<HTMLDivElement> {
  readonly type?: ToggleGroupType;
  readonly value: T | T[];
  readonly onValueChange: (value: T | T[]) => void;
}

export function ToggleGroup<T extends string | number>({
  className,
  type = "single",
  value,
  onValueChange,
  children,
  ...props
}: Readonly<ToggleGroupProps<T>>) {
  const contextValue = React.useMemo(
    () =>
      ({
        type,
        value,
        onValueChange: (val: string | number | (string | number)[]) => onValueChange(val as T | T[]),
      } as ToggleGroupContextValue),
    [type, value, onValueChange]
  );

  return (
    <ToggleGroupContext.Provider value={contextValue}>
      <div className={cn("flex gap-3", className)} {...props}>
        {children}
      </div>
    </ToggleGroupContext.Provider>
  );
}

export interface ToggleGroupItemProps<T extends string | number> extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  readonly value: T;
}

export function ToggleGroupItem<T extends string | number>({
  className,
  value,
  children,
  ...props
}: Readonly<ToggleGroupItemProps<T>>) {
  const context = React.useContext(ToggleGroupContext);
  if (!context) {
    throw new Error("ToggleGroupItem must be used within ToggleGroup");
  }

  const isSelected =
    context.type === "multiple"
      ? Array.isArray(context.value) && context.value.includes(value)
      : context.value === value;

  const handleClick = (e: React.MouseEvent<HTMLButtonElement>) => {
    if (props.disabled) return;

    if (context.type === "multiple") {
      const current = (Array.isArray(context.value) ? context.value : []) as T[];
      if (current.includes(value)) {
        const nextValue = current
          .filter((v) => v !== value)
          .sort((a, b) => (typeof a === "number" && typeof b === "number" ? a - b : String(a).localeCompare(String(b))));
        context.onValueChange(nextValue);
      } else {
        const nextValue = [...current, value].sort((a, b) =>
          typeof a === "number" && typeof b === "number" ? a - b : String(a).localeCompare(String(b))
        );
        context.onValueChange(nextValue);
      }
    } else {
      context.onValueChange(value);
    }
    props.onClick?.(e);
  };

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={props.disabled}
      className={cn(
        "flex-1 flex items-center justify-center gap-2 py-2.5 px-4 rounded-lg border text-sm font-medium transition-all",
        isSelected
          ? "border-primary bg-primary/15 text-primary"
          : "border-white/10 bg-white/5 text-slate-400 hover:border-white/20 hover:text-slate-200",
        props.disabled && "opacity-40 cursor-not-allowed pointer-events-none",
        className
      )}
      {...props}
    >
      {children}
    </button>
  );
}
