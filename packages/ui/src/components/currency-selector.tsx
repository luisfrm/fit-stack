"use client";

import * as React from "react";
import { SimpleSelect, type SimpleSelectOption } from "./simple-select";

interface CurrencySelectorProps {
  readonly value: string;
  readonly onChange: (value: string) => void;
  readonly currencies: readonly string[];
  readonly label?: string;
  readonly error?: string;
  readonly placeholder?: string;
  readonly disabled?: boolean;
}

export function CurrencySelector({
  value,
  onChange,
  currencies,
  label = "Moneda Base",
  error,
  placeholder = "Seleccionar Moneda",
  disabled
}: CurrencySelectorProps) {
  const options: SimpleSelectOption[] = React.useMemo(() => 
    currencies.map(c => ({
      label: c,
      value: c,
    })),
    [currencies]
  );

  return (
    <SimpleSelect
      value={value}
      onChange={onChange}
      options={options}
      label={label}
      error={error}
      placeholder={placeholder}
      disabled={disabled}
    />
  );
}
