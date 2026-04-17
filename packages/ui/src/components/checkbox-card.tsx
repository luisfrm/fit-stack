import * as React from "react";
import { Checkbox } from "@workspace/ui/components/checkbox";
import { Label } from "@workspace/ui/components/label";
import { cn } from "@workspace/ui/lib/utils";

export interface CheckboxCardProps {
  readonly id: string;
  readonly checked?: boolean;
  readonly onCheckedChange?: (checked: boolean) => void;
  readonly label: string;
  readonly description?: string;
  readonly className?: string;
  readonly variant?: "default" | "glass";
}

export function CheckboxCard({
  id,
  checked,
  onCheckedChange,
  label,
  description,
  className,
  variant = "default",
}: CheckboxCardProps) {
  return (
    <div
      className={cn(
        "flex items-center space-x-3 rounded-lg border p-4 transition-colors",
        variant === "default" && "bg-input border-input-border hover:bg-white/4",
        variant === "glass" && "bg-white/5 border-white/10 hover:bg-white/10 hover:border-white/20",
        className
      )}
    >
      <Checkbox
        id={id}
        checked={checked}
        onCheckedChange={onCheckedChange}
      />
      <div className="grid gap-1 leading-none">
        <Label htmlFor={id} className="text-sm font-medium text-white leading-none">
          {label}
        </Label>
        {description && (
          <p className="text-xs text-muted-foreground">
            {description}
          </p>
        )}
      </div>
    </div>
  );
}
