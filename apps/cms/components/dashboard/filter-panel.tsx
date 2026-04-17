import * as React from "react";
import { Search } from "lucide-react";
import { Input } from "@workspace/ui/components/input";
import { cn } from "@workspace/ui/lib/utils";

/**
 * Props for the FilterPanel component.
 */
export interface FilterPanelProps {
  /** Current search query value */
  readonly searchValue?: string;
  /** Callback fired when the search input changes */
  readonly onSearchChange?: (value: string) => void;
  /** Custom placeholder for the search input */
  readonly searchPlaceholder?: string;
  /** Additional children (e.g., Selects, Date pickers) */
  readonly children?: React.ReactNode;
  /** Optional extra className for the container */
  readonly className?: string;
}

/**
 * A reusable Filter Panel for dashboards.
 * Features an optional debounced-ready search input and a flexible area for additional filters.
 * Uses semantic tokens for Light/Dark mode compatibility.
 */
export function FilterPanel({
  searchValue,
  onSearchChange,
  searchPlaceholder = "Buscar...",
  children,
  className,
}: FilterPanelProps) {
  return (
    <section
      className={cn(
        "bg-surface/50 backdrop-blur-md border border-border rounded-2xl p-4 flex flex-col md:flex-row gap-4 items-center justify-between",
        className
      )}
    >
      {/* Search Input Section */}
      {onSearchChange !== undefined && (
        <div className="flex gap-2 w-full md:w-[380px]">
          <Input
            value={searchValue || ""}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder={searchPlaceholder}
            leftIcon={<Search className="size-4 animate-in fade-in zoom-in duration-500" />}
            className="bg-background/20"
          />
        </div>
      )}

      {/* Extra Filters Section */}
      {children && (
        <div className="flex flex-wrap items-center gap-3 w-full md:w-auto justify-end">
          {children}
        </div>
      )}
    </section>
  );
}
