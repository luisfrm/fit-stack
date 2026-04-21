import * as React from "react";
import { CardHeader, CardTitle, Button } from "@workspace/ui/components";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@workspace/ui/lib/utils";

export interface ChartHeaderOption {
  label: string;
  value: number | string;
}

export interface ChartHeaderProps {
  readonly title: string;
  readonly description?: string;
  readonly viewWindow: number | string;
  readonly onViewWindowChange: (value: number | string) => void;
  readonly onPrev: () => void;
  readonly onNext: () => void;
  readonly canPrev: boolean;
  readonly canNext: boolean;
  readonly options?: ChartHeaderOption[];
  readonly className?: string;
}

export function ChartHeader({
  title,
  description,
  viewWindow,
  onViewWindowChange,
  onPrev,
  onNext,
  canPrev,
  canNext,
  options = [
    { label: "7d", value: 7 },
    { label: "14d", value: 14 },
    { label: "30d", value: 30 },
  ],
  className,
}: ChartHeaderProps) {
  return (
    <CardHeader className={cn("flex flex-row items-center justify-between pb-8", className)}>
      <div className="grid gap-1">
        <CardTitle className="text-xl">{title}</CardTitle>
        {description && (
          <p className="text-sm text-muted-foreground text-balance">
            {description}
          </p>
        )}
      </div>
      <div className="flex items-center gap-2">
        {options && options.length > 0 && (<div className="flex border border-white/10 rounded-md p-1 bg-white/5 mr-2">
          {options.map((opt) => (
            <button
              key={String(opt.value)}
              onClick={() => onViewWindowChange(opt.value)}
              className={cn(
                "px-3 py-1 text-xs rounded-sm transition-colors",
                viewWindow === opt.value ? "bg-primary text-primary-foreground shadow-sm" : "hover:bg-white/10"
              )}
            >
              {opt.label}
            </button>
          ))}
        </div>
        )}
        < div className="flex items-center gap-1">
          <Button
            variant="outlined"
            size="icon"
            className="h-8 w-8"
            onClick={onPrev}
            disabled={!canPrev}
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button
            variant="outlined"
            size="icon"
            className="h-8 w-8"
            onClick={onNext}
            disabled={!canNext}
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </CardHeader >
  );
}
