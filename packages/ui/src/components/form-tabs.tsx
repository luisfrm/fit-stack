"use client"

import { Tabs, TabsList, TabsTrigger } from "./tabs"
import { cn } from "@workspace/ui/lib/utils"

interface FormTabsProps {
  /**
   * Array of step labels
   * @example ["General Info", "Plans", "Confirmation"]
   */
  readonly steps: string[];
  /**
   * Currently active step index (0-indexed)
   */
  readonly activeStep: number;
  /**
   * Callback fired when a step is selected
   */
  readonly onStepChange: (stepIndex: number) => void;
  /**
   * Optional className for the root element
   */
  readonly className?: string;
  /**
   * Optional className for the list element
   */
  readonly listClassName?: string;
  /**
   * Variant for the tabs list
   */
  readonly variant?: "glass" | "surface" | "input" | "plain";
}

/**
 * A specialized Tabs component for multi-step forms.
 * It manages step labels and fires a callback with the index of the selected step.
 */
export function FormTabs({
  steps,
  activeStep,
  onStepChange,
  className,
  listClassName,
  variant = "input", // Default to input for forms
}: FormTabsProps) {
  return (
    <Tabs
      value={activeStep.toString()}
      onValueChange={(value) => onStepChange(parseInt(value, 10))}
      className={cn("w-full", className)}
    >
      <TabsList
        variant={variant}
        className={cn("w-fit justify-start p-1.5 h-auto", listClassName)}
      >
        {steps.map((step, index) => (
          <TabsTrigger
            key={step}
            value={index.toString()}
            className="flex-none px-6 py-2.5 h-10"
          >
            <span className="flex items-center gap-2">
              <span className={cn(
                "flex h-5 w-5 items-center justify-center rounded-full text-[10px] border transition-colors",
                activeStep === index
                  ? "bg-primary text-primary-foreground border-primary"
                  : "bg-surface border-border text-foreground-muted"
              )}>
                {index + 1}
              </span>
              {step}
            </span>
          </TabsTrigger>
        ))}
      </TabsList>
      {/* 
        Note: TabsContent is intentionally omitted here as the parent 
        usually handles conditional rendering of form sections.
      */}
    </Tabs>
  )
}
