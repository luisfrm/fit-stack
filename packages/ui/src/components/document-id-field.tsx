"use client";

import * as React from "react";
import { Input } from "@workspace/ui/components/input";
import { SimpleSelect } from "@workspace/ui/components/simple-select";
import { Label } from "@workspace/ui/components/label";

/**
 * Identification value in the persisted `"<type>-<number>"` form.
 * Structural type on purpose: callers pass the result of the shared
 * `parseDocumentId`/`formatDocumentId` (this package stays domain-free).
 */
export interface DocumentIdValue {
  readonly type: string;
  readonly number: string;
}

interface DocumentIdFieldProps {
  /**
   * Country label declared by `COUNTRIES` (SSOT): `docLabel` for a natural
   * person (`C.I.`, `C.C.`), `taxLabel` for an organization (`R.I.F.`, `NIT`).
   */
  readonly label: string;
  /** Accepted prefixes (`COUNTRIES[cc].docType`). Empty = no prefix universe. */
  readonly types: readonly string[];
  readonly value: DocumentIdValue;
  readonly onChange: (next: DocumentIdValue) => void;
  /** Prefix selected while the stored value carries none (defaults to `types[0]`). */
  readonly defaultType?: string;
  readonly placeholder?: string;
  readonly disabled?: boolean;
  readonly required?: boolean;
  /** Forwarded to the number input so external form selectors keep working. */
  readonly name?: string;
  /** `data-testid` of the number input; the prefix selector gets `${testId}-type`. */
  readonly testId?: string;
  readonly leftIcon?: React.ReactNode;
}

/**
 * Identification field = prefix selector (`docType`) + number input.
 * Without a prefix universe (country not resolved) it degrades to the plain
 * number input, so the whole raw value keeps working as before.
 */
export function DocumentIdField({
  label,
  types,
  value,
  onChange,
  defaultType,
  placeholder,
  disabled = false,
  required = false,
  name,
  testId,
  leftIcon,
}: DocumentIdFieldProps) {
  const inputId = React.useId();
  const selectedType = value.type || defaultType || types[0] || "";

  if (types.length === 0) {
    return (
      <Input
        id={inputId}
        label={label}
        placeholder={placeholder}
        value={value.number}
        onChange={(e) => onChange({ type: "", number: e.target.value })}
        leftIcon={leftIcon}
        disabled={disabled}
        required={required}
        name={name}
        data-testid={testId}
      />
    );
  }

  return (
    <div className="flex flex-col gap-1.5 w-full">
      <Label
        htmlFor={inputId}
        className="text-xs font-semibold uppercase tracking-wider text-foreground-muted"
      >
        {label}
        {required && <span className="text-primary"> *</span>}
      </Label>

      <div className="flex items-start gap-2">
        <div className="w-24 shrink-0" data-testid={testId ? `${testId}-type` : undefined}>
          <SimpleSelect
            value={selectedType}
            onChange={(next) => onChange({ type: next, number: value.number })}
            options={types.map((type) => ({ value: type, label: type }))}
            placeholder="Tipo"
            disabled={disabled}
            required={required}
          />
        </div>

        <Input
          id={inputId}
          placeholder={placeholder}
          value={value.number}
          onChange={(e) => onChange({ type: selectedType, number: e.target.value })}
          leftIcon={leftIcon}
          disabled={disabled}
          required={required}
          name={name}
          data-testid={testId}
        />
      </div>
    </div>
  );
}
