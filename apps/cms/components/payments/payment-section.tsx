"use client";

import * as React from "react";
import { Calculator, CircleDollarSign, CreditCard } from "lucide-react";
import {
  Card,
  Text,
  Label,
  Input,
  SimpleSelect,
  CurrencySelector
} from "@workspace/ui/components";
import { ImageUpload } from "@workspace/ui/components/image-upload";
import {
  type IMembershipPlan,
  type IPaymentMethodConfig
} from "@/types/dashboard";
import { ValueConverter, type CurrencyFormat } from "@/lib/utils/value-converters";
import { cn } from "@workspace/ui/lib/utils";

interface PaymentSectionProps {
  readonly selectedPlan: IMembershipPlan;
  readonly paymentCurrency: string;
  readonly paymentMethodId: string;
  readonly activeCurrencies: string[];
  readonly activePaymentMethods: IPaymentMethodConfig[];
  readonly finalAmount: number;
  readonly currencyFormat: CurrencyFormat;
  readonly selectedPaymentConfig?: IPaymentMethodConfig;
  readonly dynamicFieldValues: Record<string, any>;
  readonly onDynamicChange: (id: string, value: any) => void;
  readonly exchangeRate: number;
  readonly rateFocus: boolean;
  readonly amountFocus: boolean;
  readonly onRateFocus: (focused: boolean) => void;
  readonly onAmountFocus: (focused: boolean) => void;
  readonly onRateChange: (value: number) => void;
  readonly onAmountChange: (value: number) => void;
  readonly onCurrencyChange: (value: string) => void;
  readonly onMethodChange: (value: string) => void;
  readonly allowPriceOverride: boolean;
  readonly paymentDetails: string;
  readonly onPaymentDetailsChange: (value: string) => void;
}

export function PaymentSection({
  selectedPlan,
  paymentCurrency,
  paymentMethodId,
  activeCurrencies,
  activePaymentMethods,
  finalAmount,
  currencyFormat,
  selectedPaymentConfig,
  dynamicFieldValues,
  onDynamicChange,
  exchangeRate,
  rateFocus,
  amountFocus,
  onRateFocus,
  onAmountFocus,
  onRateChange,
  onAmountChange,
  onCurrencyChange,
  onMethodChange,
  allowPriceOverride,
  paymentDetails,
  onPaymentDetailsChange,
}: PaymentSectionProps) {
  return (
    <Card className="p-6 space-y-5 animate-in fade-in slide-in-from-bottom-2 duration-500">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <Calculator className="w-5 h-5 text-primary" />
          <Text weight="bold" uppercase size="base" as="div">Detalles del Pago</Text>
        </div>
      </div>


      <div className="space-y-6 animate-in fade-in zoom-in-95 duration-300">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <CurrencySelector
            value={paymentCurrency}
            onChange={onCurrencyChange}
            currencies={activeCurrencies}
            label="Moneda de Pago"
          />

          <SimpleSelect
            label="Método de Pago"
            value={paymentMethodId}
            onChange={onMethodChange}
            placeholder="Seleccionar Método"
            options={[
              ...activePaymentMethods.map(method => ({
                value: method.id,
                label: method.name
              })),
              { value: "other", label: "Otro / Personalizado" }
            ]}
          />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-4 border-t border-border">
          {paymentCurrency !== selectedPlan.currency && (
            <div className="space-y-2">
              <Label htmlFor="exchange-rate" className="text-xs font-semibold text-muted-foreground uppercase">
                Tasa ({selectedPlan.currency} {"\u2192"} {paymentCurrency})
              </Label>
              <Input
                id="exchange-rate"
                type={rateFocus ? "number" : "text"}
                step="0.01"
                value={rateFocus ? exchangeRate : ValueConverter.format(exchangeRate, "", currencyFormat)}
                onFocus={() => onRateFocus(true)}
                onBlur={() => onRateFocus(false)}
                onChange={(e) => onRateChange(ValueConverter.parse(e.target.value, currencyFormat))}
                variant="default"
                leftIcon={<CircleDollarSign size={16} />}
              />
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="final-amount" className="text-xs font-semibold text-muted-foreground uppercase">Monto Total a Recibir</Label>
            <Input
              id="final-amount"
              type={amountFocus ? "number" : "text"}
              step="0.01"
              value={amountFocus ? finalAmount : ValueConverter.format(finalAmount, "", currencyFormat)}
              onFocus={() => onAmountFocus(true)}
              onBlur={() => onAmountFocus(false)}
              onChange={(e) => onAmountChange(ValueConverter.parse(e.target.value, currencyFormat))}
              readOnly={!allowPriceOverride}
              variant="default"
              className={allowPriceOverride ? "" : "opacity-70"}
              leftIcon={<CreditCard size={16} />}
            />
            {!allowPriceOverride && (
              <p className="text-[10px] text-muted-foreground italic">Basado en el plan. No editable.</p>
            )}
          </div>
        </div>
      </div>


      {/* Dynamic Fields */}
      {selectedPaymentConfig && selectedPaymentConfig.fields.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-2 border-t border-border">
          {selectedPaymentConfig.fields.map(field => (
            <div key={field.id} className={cn("space-y-2", field.type === 'file' && "md:col-span-2")}>
              <Text as="label" variant="muted" size="xs" weight="bold" uppercase className="flex items-center gap-1">
                {field.label}
                {field.required && <span className="text-red-500">*</span>}
              </Text>

              {field.type === 'file' ? (
                <ImageUpload
                  value={typeof dynamicFieldValues[field.id] === 'string' ? dynamicFieldValues[field.id] : undefined}
                  onChange={(file) => onDynamicChange(field.id, file)}
                  onRemove={() => onDynamicChange(field.id, null)}
                  className="w-full"
                />
              ) : (
                <Input
                  type={field.type === 'number' ? 'number' : 'text'}
                  placeholder={`Ingresa ${field.label.toLowerCase()}...`}
                  value={dynamicFieldValues[field.id] || ""}
                  onChange={(e) => onDynamicChange(field.id, e.target.value)}
                />
              )}
            </div>
          ))}
        </div>
      )}

      {paymentMethodId === 'other' && (
        <div className="space-y-2 animate-in fade-in slide-in-from-top-1 duration-300">
          <Label id="other-method-details-label" className="text-xs font-semibold text-muted-foreground uppercase">Especificar Método / Referencia</Label>
          <Input
            id="other-method-details"
            placeholder="Ej: Transferencia Banco Mercantil..."
            value={paymentDetails}
            onChange={(e) => onPaymentDetailsChange(e.target.value)}
            variant="default"
            aria-labelledby="other-method-details-label"
          />
        </div>
      )}
    </Card>
  );
}
