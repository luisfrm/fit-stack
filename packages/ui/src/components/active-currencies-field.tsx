"use client";

import * as React from "react";
import { Search, CheckCircle2 } from "lucide-react";
import { BadgeDollarSign } from "lucide-react";
import { Button } from "./button";
import { Input } from "./input";
import { Text } from "./text";

interface ActiveCurrenciesFieldProps {
  /** Universo elegible (p. ej. `COUNTRY_INDEX.currencies`). */
  readonly currencies: readonly string[];
  /** Monedas activas seleccionadas. */
  readonly value: string[];
  readonly onChange: (next: string[]) => void;
  /** Monedas que no se pueden quitar (p. ej. la principal derivada). */
  readonly locked?: readonly string[];
  readonly label?: string;
  readonly hint?: string;
  readonly disabled?: boolean;
  /** Se invoca al intentar quitar una moneda bloqueada (p. ej. para un toast). */
  readonly onLockedAttempt?: (code: string) => void;
}

export function ActiveCurrenciesField({
  currencies,
  value,
  onChange,
  locked = [],
  label = "Monedas activas",
  hint,
  disabled = false,
  onLockedAttempt,
}: ActiveCurrenciesFieldProps) {
  const [isEditing, setIsEditing] = React.useState(false);
  const [searchQuery, setSearchQuery] = React.useState("");

  const toggle = (code: string) => {
    if (value.includes(code)) {
      if (locked.includes(code)) {
        onLockedAttempt?.(code);
        return;
      }
      onChange(value.filter((c) => c !== code));
    } else {
      onChange([...value, code]);
    }
  };

  const filtered = React.useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    const base = q
      ? currencies.filter((c) => c.toLowerCase().includes(q))
      : [...currencies];
    return base.sort((a, b) => {
      const aActive = value.includes(a);
      const bActive = value.includes(b);
      if (aActive && !bActive) return -1;
      if (!aActive && bActive) return 1;
      return a.localeCompare(b);
    });
  }, [currencies, searchQuery, value]);

  return (
    <div className="space-y-4">
      {isEditing ? (
        <div className="space-y-4 animate-in fade-in zoom-in-95 duration-200">
          <div className="flex gap-2">
            <Input
              placeholder="Buscar moneda (ej: USD, EUR, MXN...)"
              leftIcon={<Search className="w-4 h-4" />}
              className="px-4"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setIsEditing(false)}
              className="text-white/40 hover:text-white h-12"
            >
              Cerrar
            </Button>
          </div>

          <div className="h-[250px] overflow-y-auto pr-2 space-y-1 scrollbar-thin scrollbar-thumb-white/10">
            {filtered.map((code) => {
              const active = value.includes(code);
              const isLocked = locked.includes(code);
              return (
                <Button
                  key={code}
                  type="button"
                  variant={active ? "glass" : "ghost"}
                  fullWidth
                  onClick={() => toggle(code)}
                  className="justify-between px-4 h-12"
                  rightIcon={
                    active ? <CheckCircle2 className="w-4 h-4 text-primary" /> : null
                  }
                >
                  <span className="font-mono font-bold text-[11px]">
                    {code}
                    {isLocked ? " (principal)" : ""}
                  </span>
                </Button>
              );
            })}
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <Text className="text-[10px] font-bold text-white/40 uppercase tracking-widest">
              {label}
            </Text>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setIsEditing(true)}
              disabled={disabled}
              className="text-primary hover:bg-primary/10 h-7 text-[10px] font-bold uppercase"
            >
              Modificar lista
            </Button>
          </div>
          <div className="flex flex-wrap gap-2">
            {value.map((code) => (
              <div
                key={code}
                className="flex items-center gap-2 px-3 py-2 rounded-xl bg-primary/5 border border-primary/20 text-white"
              >
                <span className="font-mono font-bold text-xs">{code}</span>
                {locked.includes(code) && (
                  <BadgeDollarSign className="w-3 h-3 text-primary" />
                )}
              </div>
            ))}
            {value.length === 0 && (
              <Text className="text-xs text-white/20 italic">
                No hay monedas seleccionadas.
              </Text>
            )}
          </div>
        </div>
      )}
      {hint && (
        <Text className="text-[9px] text-white/40 leading-relaxed italic">{hint}</Text>
      )}
    </div>
  );
}
