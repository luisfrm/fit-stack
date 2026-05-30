import * as React from "react";
import { Search, Settings2 } from "lucide-react";
import { Input } from "@workspace/ui/components/input";
import { SimpleSelect, type SimpleSelectOption } from "@workspace/ui/components/simple-select";
import { cn } from "@workspace/ui/lib/utils";

export interface FilterPanelProps {
  readonly searchValue?: string;
  readonly onSearchChange?: (value: string) => void;
  readonly searchPlaceholder?: string;
  readonly children?: React.ReactNode;
  readonly className?: string;
  readonly filterOptions?: readonly SimpleSelectOption[];
  readonly activeFilter?: string | null;
  readonly onFilterChange?: (value: string | null) => void;
  readonly filterLabel?: string;
}

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

  return (
    <section
      className={cn(
        "bg-transparent border border-transparent rounded-2xl flex flex-col md:flex-row gap-4 items-center justify-between",
        className
      )}
    >
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

      {hasFilters && (
        <>
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