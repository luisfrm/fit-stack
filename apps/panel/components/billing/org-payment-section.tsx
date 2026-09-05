"use client";

import * as React from "react";
import { Calculator, CreditCard, Eye, Info } from "lucide-react";
import {
  Card,
  Text,
  Input,
  SimpleSelect,
  CurrencySelector,
} from "@workspace/ui/components";
import { ImageUpload } from "@workspace/ui/components/image-upload";
import { sortPaymentMethodFields } from "@workspace/shared";
import type { IPaymentMethodConfig } from "@workspace/shared/types";
import { cn } from "@workspace/ui/lib/utils";

interface OrgPaymentSectionProps {
  readonly planName: string;
  readonly planPriceCents: number;
  readonly planCurrency: string;
  readonly paymentCurrency: string;
  readonly paymentMethodId: string;
  readonly activeCurrencies: string[];
  readonly activePaymentMethods: IPaymentMethodConfig[];
  readonly selectedPaymentConfig?: IPaymentMethodConfig;
  readonly dynamicFieldValues: Record<string, any>;
  readonly onDynamicChange: (id: string, value: any) => void;
  /** Tasa en vivo del frontend — SOLO referencial (el backend la calcula al registrar). */
  readonly referenceRate: number;
  readonly referenceAmount: number;
  readonly paymentDate: string;
  readonly onPaymentDateChange: (value: string) => void;
  readonly onCurrencyChange: (value: string) => void;
  readonly onMethodChange: (value: string) => void;
  readonly disabled?: boolean;
}

export function OrgPaymentSection({
  planName,
  planPriceCents,
  planCurrency,
  paymentCurrency,
  paymentMethodId,
  activeCurrencies,
  activePaymentMethods,
  selectedPaymentConfig,
  dynamicFieldValues,
  onDynamicChange,
  referenceRate,
  referenceAmount,
  paymentDate,
  onPaymentDateChange,
  onCurrencyChange,
  onMethodChange,
  disabled,
}: OrgPaymentSectionProps) {
  const baseAmount = planPriceCents / 100;

  return (
    <Card className={cn(
      "p-6 space-y-5 animate-in fade-in slide-in-from-bottom-2 duration-500",
      disabled && "opacity-40 cursor-not-allowed transition-opacity"
    )}>
      <div className="flex items-center gap-2 mb-2">
        <Calculator className="w-5 h-5 text-primary" />
        <Text weight="bold" uppercase size="base" as="div">Detalles del Pago</Text>
      </div>

      <div className="space-y-6 animate-in fade-in zoom-in-95 duration-300">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <CurrencySelector
            value={paymentCurrency}
            onChange={onCurrencyChange}
            currencies={activeCurrencies}
            label="Moneda de Pago"
            disabled={disabled}
          />

          <Input
            id="org-payment-date"
            type="date"
            label="Fecha de Operación"
            value={paymentDate}
            onChange={(e) => onPaymentDateChange(e.target.value)}
            disabled={disabled}
          />

          <SimpleSelect
            className="md:col-span-2"
            label="Método de Pago"
            value={paymentMethodId}
            onChange={onMethodChange}
            placeholder="Seleccionar Método"
            disabled={disabled}
            options={activePaymentMethods.map(method => ({
              value: method.id,
              label: method.name
            }))}
          />
        </div>

        <div className="rounded-xl border border-border bg-foreground/3 p-4 space-y-1.5">
          <div className="flex items-center justify-between gap-3">
            <Text size="xs" variant="muted" uppercase className="font-bold tracking-wider">
              Monto a Pagar
            </Text>
            <Text weight="bold" className="tabular-nums">
              {baseAmount.toLocaleString("es-VE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} {planCurrency}
            </Text>
          </div>
          {paymentCurrency !== planCurrency && referenceRate > 0 && (
            <div className="flex items-center justify-between gap-3">
              <Text size="xs" variant="muted" uppercase className="font-bold tracking-wider">
                Monto referencial ({paymentCurrency})
              </Text>
              <Text size="sm" className="tabular-nums opacity-80">
                {referenceAmount.toLocaleString("es-VE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} {paymentCurrency}
              </Text>
            </div>
          )}
          <div className="flex items-start gap-1.5 pt-1.5 border-t border-border-muted">
            <Info className="w-3.5 h-3.5 text-foreground-dim shrink-0 mt-0.5" />
            <Text size="xs" variant="muted" className="leading-relaxed">
              Monto referencial para tu cálculo. El sistema calcula la tasa oficial y el monto final al momento de registrar el pago de {planName}.
            </Text>
          </div>
        </div>
      </div>

      {/* Dynamic Fields — visuales primero (instrucciones), luego inputs */}
      {selectedPaymentConfig && selectedPaymentConfig.fields.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-2 border-t border-border">
          {sortPaymentMethodFields(selectedPaymentConfig.fields).map(field => (
            <div key={field.id} className={cn("space-y-2", (field.type === 'file' || field.type === 'visual') && "md:col-span-2")}>
              <Text as="label" variant="muted" size="xs" weight="bold" uppercase className="flex items-center gap-1">
                {field.label}
                {field.required && <span className="text-red-500">*</span>}
              </Text>

              {field.type === 'visual' ? (
                <div className="rounded-xl border border-border bg-foreground/3 p-4 space-y-2 animate-in fade-in zoom-in-95 duration-300">
                  <div className="flex items-center gap-2">
                    <Eye className="w-4 h-4 text-primary" />
                    <Text as="span" variant="muted" size="xs" weight="bold" uppercase className="tracking-wider">
                      Instrucciones de pago
                    </Text>
                  </div>
                  <Text size="sm" className="whitespace-pre-line leading-relaxed">
                    {field.value || "Sin instrucciones configuradas."}
                  </Text>
                </div>
              ) : field.type === 'file' ? (
                <ImageUpload
                  value={typeof dynamicFieldValues[field.id] === 'string' ? dynamicFieldValues[field.id] : undefined}
                  onChange={(file) => onDynamicChange(field.id, file)}
                  onRemove={() => onDynamicChange(field.id, null)}
                  className="w-full"
                  disabled={disabled}
                />
              ) : (
                <Input
                  type={field.type === 'number' ? 'number' : 'text'}
                  placeholder="Escribe aquí..."
                  value={dynamicFieldValues[field.id] || ""}
                  onChange={(e) => onDynamicChange(field.id, e.target.value)}
                  disabled={disabled}
                />
              )}
            </div>
          ))}
        </div>
      )}

      <div className="flex items-center justify-between p-4 rounded-xl border border-dashed border-border bg-accent/5">
        <div className="flex flex-col gap-0.5">
          <Text weight="bold" size="sm">Pago en revisión</Text>
          <Text size="xs" variant="muted">El pago quedará pendiente hasta que el equipo Fit-Stack lo verifique y apruebe.</Text>
        </div>
        <CreditCard className="w-4 h-4 text-foreground-dim" />
      </div>
    </Card>
  );
}