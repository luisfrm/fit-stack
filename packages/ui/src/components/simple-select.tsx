"use client";

import * as React from "react";
import { Search, Check, ChevronsUpDown } from "lucide-react";
import {
  Input,
  Button,
  Label,
  Text
} from "@workspace/ui/components";
import { cn } from "@workspace/ui/lib/utils";

export interface SimpleSelectOption {
  value: string;
  label: string;
  description?: string;
}

interface SimpleSelectProps {
  readonly value: string;
  readonly onChange: (value: string) => void;
  readonly options: readonly SimpleSelectOption[];
  readonly label?: string;
  readonly error?: string;
  readonly placeholder?: string;
  readonly showSearch?: boolean;
  readonly className?: string;
  readonly variant?: "default" | "glass";
  readonly size?: "sm" | "md" | "lg" | "xl";
}

export function SimpleSelect({
  value,
  onChange,
  options,
  label,
  error,
  placeholder = "Seleccionar...",
  showSearch = false,
  className,
  variant = "default",
  size = "md"
}: SimpleSelectProps) {
  const [open, setOpen] = React.useState(false);
  const [search, setSearch] = React.useState("");

  const selectedOption = React.useMemo(() =>
    options.find(o => o.value === value),
    [value, options]
  );

  const filteredOptions = React.useMemo(() => {
    if (!search || !showSearch) return options;
    const lowerSearch = search.toLowerCase();
    return options.filter(o =>
      o.label.toLowerCase().includes(lowerSearch) ||
      o.value.toLowerCase().includes(lowerSearch)
    );
  }, [search, options, showSearch]);

  const containerRef = React.useRef<HTMLDivElement>(null);
  React.useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  return (
    <div className={cn("space-y-1.5 relative w-full", className)} ref={containerRef}>
      {label && (
        <Label className="text-xs font-semibold uppercase tracking-wider text-gray-400">
          {label}
        </Label>
      )}

      <Button
        type="button"
        variant={variant === "glass" ? "glass" : "secondary"}
        size={size}
        fullWidth
        onClick={() => setOpen(!open)}
        role="combobox"
        aria-expanded={open}
        className={cn(
          "justify-between font-medium normal-case tracking-normal",
          open && "border-primary ring-1 ring-primary",
          error && "border-red-500 ring-red-500"
        )}
      >
        <div className="flex items-center gap-2 overflow-hidden">
          {selectedOption ? (
            <span className="text-sm text-white truncate">
              {selectedOption.label}
            </span>
          ) : (
            <span className="text-sm text-slate-500 italic truncate">{placeholder}</span>
          )}
        </div>
        <ChevronsUpDown className="size-4 text-slate-500 shrink-0" />
      </Button>

      {open && (
        <div className="absolute z-50 w-full mt-1.5 bg-surface border border-border rounded-md shadow-2xl overflow-hidden animate-in fade-in slide-in-from-top-2 duration-200">
          {showSearch && (
            <div className="p-2 border-b border-border bg-surface">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-3.5 text-slate-500" />
                <Input
                  placeholder="Buscar..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="pl-5 h-9 text-xs"
                  autoFocus
                  variant={variant}
                />
              </div>
            </div>
          )}

          <div className="max-h-60 overflow-y-auto py-1 custom-scrollbar">
            {filteredOptions.length > 0 ? (
              filteredOptions.map((option) => (
                <Button
                  key={option.value}
                  type="button"
                  variant="ghost"
                  role="option"
                  aria-selected={value === option.value}
                  onClick={() => {
                    onChange(option.value);
                    setOpen(false);
                    setSearch("");
                  }}
                  className={cn(
                    "flex w-full items-center justify-between px-3 py-2.5 h-auto rounded-none border-b border-white/5 last:border-0 transition-colors select-none font-medium normal-case tracking-normal",
                    value === option.value 
                      ? "bg-primary/10 text-primary hover:bg-primary/20 hover:text-primary" 
                      : "text-white hover:bg-white/5 focus:bg-white/5"
                  )}
                >
                  <div className="flex flex-col items-start overflow-hidden">
                    <span className="truncate w-full text-left">
                      {option.label}
                    </span>
                    {option.description && (
                      <span className="text-[10px] text-slate-500 italic truncate w-full text-left">
                        {option.description}
                      </span>
                    )}
                  </div>
                  {value === option.value && (
                    <Check className="size-4 text-primary shrink-0 ml-2" />
                  )}
                </Button>
              ))
            ) : (
              <div className="px-4 py-8 text-center">
                <Text size="xs" variant="muted" className="italic opacity-50">
                  Sin resultados
                </Text>
              </div>
            )}
          </div>
        </div>
      )}

      {error && (
        <p className="text-xs text-red-500 font-medium mt-1">
          {error}
        </p>
      )}
    </div>
  );
}
