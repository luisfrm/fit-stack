import * as React from "react";
import { Search, Settings2, X } from "lucide-react";
import { Input, Button } from "@workspace/ui/components";
import { SimpleSelect, type SimpleSelectOption } from "@workspace/ui/components/simple-select";
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
  /** Filter options for mobile dropdown */
  readonly filterOptions?: readonly SimpleSelectOption[];
  /** Currently active filter value */
  readonly activeFilter?: string | null;
  /** Callback fired when filter changes */
  readonly onFilterChange?: (value: string | null) => void;
  /** Label for the filter dropdown */
  readonly filterLabel?: string;
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
  filterOptions,
  activeFilter,
  onFilterChange,
  filterLabel = "Filtros",
}: FilterPanelProps) {
  const hasFilters = !!children || !!filterOptions;
  const hasActiveFilter = activeFilter && activeFilter !== null;

  const selectedFilterLabel = React.useMemo(() => {
    if (!activeFilter || !filterOptions) return filterLabel;
    const option = filterOptions.find(o => o.value === activeFilter);
    return option?.label || filterLabel;
  }, [activeFilter, filterOptions, filterLabel]);

  return (
    <section
      className={cn(
        "bg-transparent border border-transparent rounded-2xl flex flex-col md:flex-row gap-4 items-center justify-between",
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
          />
        </div>
      )}

      {/* Extra Filters Section */}
      {hasFilters && (
        <>
          {/* Mobile: Dropdown Select */}
          {filterOptions && (
            <div className="block md:hidden w-full">
              <SimpleSelect
                value={activeFilter || ""}
                onChange={(value) => onFilterChange?.(value === activeFilter ? null : value)}
                options={filterOptions}
                placeholder={filterLabel}
                size="sm"
                variant="default"
                leftIcon={<Settings2 className="size-4" />}
              />
            </div>
          )}

          {/* Desktop: Inline buttons (hidden on mobile, shown on md+) */}
          {children && (
            <div className="hidden md:flex flex-wrap items-center gap-3 w-full md:w-auto justify-end">
              {children}
            </div>
          )}
        </>
      )}
    </section>
  );
}
