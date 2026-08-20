import * as React from "react";
import { cn } from "@workspace/ui/lib/utils";

interface LogotipoProps {
  /**
   * Font class applied to the "Fit" half (title font).
   * "Stack" always uses the body font (`font-sans`).
   */
  font?: string;
  className?: string;
}

/**
 * "Fit" + "Stack" logotype: "Fit" in the title font colored with the brand
 * primary (yellow), "Stack" in the body font using `foreground` (auto white
 * or black depending on the active theme).
 */
export function Logotipo({ font = "font-display", className }: Readonly<LogotipoProps>) {
  return (
    <span className={cn("inline-flex items-baseline leading-none select-none text-3xl font-bold", className)}>
      <span className={cn(font, "text-primary")}>FIT</span>
      <span className="font-sans text-foreground">STACK</span>
    </span>
  );
}