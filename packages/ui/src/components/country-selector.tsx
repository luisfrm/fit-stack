"use client";

import * as React from "react";
import { Search, Globe, Check, ChevronsUpDown } from "lucide-react";
import {
  Input,
  Button,
  Label,
  Text
} from "@workspace/ui/components";
import { cn } from "@workspace/ui/lib/utils";

export interface CountryListItem {
  name: string;
  code: string;
  flag?: string;
  currency?: string;
}

interface CountrySelectorProps {
  readonly value: string;
  readonly onChange: (code: string) => void;
  readonly countries: readonly CountryListItem[];
  readonly label?: string;
  readonly error?: string;
  readonly placeholder?: string;
}

export function CountrySelector({
  value,
  onChange,
  countries,
  label = "País de Operación",
  error,
  placeholder = "Seleccionar país..."
}: CountrySelectorProps) {
  const [open, setOpen] = React.useState(false);
  const [search, setSearch] = React.useState("");

  const selectedCountry = React.useMemo(() =>
    countries.find(c => c.code === value),
    [value, countries]
  );

  const filteredCountries = React.useMemo(() => {
    if (!search) return countries;
    const lowerSearch = search.toLowerCase();
    return countries.filter(c =>
      c.name.toLowerCase().includes(lowerSearch) ||
      c.code.toLowerCase().includes(lowerSearch)
    );
  }, [search, countries]);

  // Handle click outside to close dropdown
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
    <div className="flex flex-col gap-1.5 relative" ref={containerRef}>
      {label && (
        <Label className="text-xs font-semibold uppercase tracking-wider text-foreground-muted">
          {label}
        </Label>
      )}

      <Button
        id="country-selector-trigger"
        type="button"
        variant="secondary"
        fullWidth
        onClick={() => setOpen(!open)}
        role="combobox"
        aria-expanded={open}
        aria-haspopup="listbox"
        aria-controls="country-listbox"
        className={cn("justify-between px-4", open ? "ring-2 ring-primary/50" : "")}
      >
        <div className="flex items-center gap-3">
          {selectedCountry ? (
            <>
              {selectedCountry.flag && <span className="text-lg leading-none">{selectedCountry.flag}</span>}
              <span className="text-sm font-bold uppercase tracking-tight text-foreground">
                {selectedCountry.name}
              </span>
              <span className="text-[10px] bg-foreground/5 px-1.5 py-0.5 rounded font-black text-foreground-muted">
                {selectedCountry.code}
              </span>
            </>
          ) : (
            <>
              <Globe className="size-4 text-foreground-dim" />
              <span className="text-sm text-foreground-dim font-medium italic">{placeholder}</span>
            </>
          )}
        </div>
        <ChevronsUpDown className="size-4 text-foreground-dim" />
      </Button>

      {open && (
        <div
          id="country-listbox"
          aria-labelledby="country-selector-trigger"
          className="absolute z-50 w-full mt-2 bg-popover border border-border rounded-2xl shadow-2xl overflow-hidden animate-in fade-in slide-in-from-top-2 duration-200"
        >
          <div className="p-3 border-b border-border-muted bg-popover">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-3.5 text-foreground-dim" />
              <Input
                placeholder="Buscar país por nombre o código..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-5 h-9 text-xs"
                autoFocus
              />
            </div>
          </div>

          <div className="max-h-60 overflow-y-auto custom-scrollbar">
            {filteredCountries.length > 0 ? (
              filteredCountries.map((country) => (
                <Button
                  key={country.code}
                  type="button"
                  variant="ghost"
                  fullWidth
                  role="option"
                  aria-selected={value === country.code}
                  onClick={() => {
                    onChange(country.code);
                    setOpen(false);
                    setSearch("");
                  }}
                  className={cn(
                    "flex items-center justify-between px-4 py-3 h-auto rounded-none border-b border-border-muted last:border-0 transition-colors group",
                    value === country.code ? "bg-primary/5 hover:bg-primary/10" : "bg-transparent"
                  )}
                >
                  <div className="flex items-center gap-3">
                    {country.flag && <span className="text-lg leading-none">{country.flag}</span>}
                    <div className="flex flex-col items-start">
                      <span className={cn(
                        "text-xs font-bold uppercase tracking-tight",
                        value === country.code ? "text-primary" : "text-foreground"
                      )}>
                        {country.name}
                      </span>
                      {country.currency && (
                        <span className="text-[10px] text-foreground-dim font-medium font-outfit">
                          Moneda: {country.currency}
                        </span>
                      )}
                    </div>
                  </div>
                  {value === country.code && (
                    <Check className="size-4 text-primary" />
                  )}
                </Button>
              ))
            ) : (
              <div className="px-4 py-8 text-center">
                <Text size="xs" variant="muted" className="italic opacity-50">
                  No se encontraron países que coincidan
                </Text>
              </div>
            )}
          </div>
        </div>
      )}

      {error && (
        <Text size="xs" className="text-destructive font-medium mt-1">
          {error}
        </Text>
      )}
    </div>
  );
}
