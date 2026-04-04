"use client";

import * as React from "react";
import { Calculator, CircleDollarSign, CreditCard } from "lucide-react";
import { 
  Card, 
  Button, 
  Text, 
  Label, 
  Select, 
  SelectTrigger, 
  SelectValue, 
  SelectContent, 
  SelectItem, 
  Input
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
  readonly isEditingPayment: boolean;
  readonly onToggleEdit: () => void;
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
  isEditingPayment,
  onToggleEdit,
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
    <Card className="p-6 border-white/5 bg-white/2 space-y-5 animate-in fade-in slide-in-from-bottom-2 duration-500">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <Calculator className="w-5 h-5 text-primary" />
          <h3 className="text-sm font-bold uppercase tracking-widest text-white">Detalles del Pago</h3>
        </div>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={onToggleEdit}
          className="text-[10px] font-bold text-primary uppercase h-7 px-3 hover:bg-primary/10"
        >
          {isEditingPayment ? "Ocultar" : "Modificar"}
        </Button>
      </div>

      {isEditingPayment ? (
        <div className="space-y-6 animate-in fade-in zoom-in-95 duration-300">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label id="payment-currency-label" className="text-xs font-semibold text-slate-400 uppercase">Moneda de Pago</Label>
              <Select value={paymentCurrency} onValueChange={onCurrencyChange}>
                <SelectTrigger aria-labelledby="payment-currency-label" className="w-full bg-white/2 border-white/5 h-10">
                  <SelectValue placeholder="Seleccionar Moneda" />
                </SelectTrigger>
                <SelectContent>
                  {activeCurrencies.map(code => (
                    <SelectItem key={`cur-${code}`} value={code}>{code}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label id="payment-method-label" className="text-xs font-semibold text-slate-400 uppercase">Método de Pago</Label>
              <Select value={paymentMethodId} onValueChange={onMethodChange}>
                <SelectTrigger aria-labelledby="payment-method-label" className="w-full bg-white/2 border-white/5 h-10">
                  <SelectValue placeholder="Seleccionar Método" />
                </SelectTrigger>
                <SelectContent>
                  {activePaymentMethods.map(method => (
                    <SelectItem key={method.id} value={method.id}>{method.name}</SelectItem>
                  ))}
                  <SelectItem value="other">Otro / Personalizado</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-4 border-t border-white/5">
            {paymentCurrency !== selectedPlan.currency && (
              <div className="space-y-2">
                <Label htmlFor="exchange-rate" className="text-xs font-semibold text-slate-400 uppercase">
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
                  leftIcon={<CircleDollarSign size={16} />}
                />
              </div>
            )}

            <div className="space-y-2">
              <Label htmlFor="final-amount" className="text-xs font-semibold text-slate-400 uppercase">Monto Total a Recibir</Label>
              <Input
                id="final-amount"
                type={amountFocus ? "number" : "text"}
                step="0.01"
                value={amountFocus ? finalAmount : ValueConverter.format(finalAmount, "", currencyFormat)}
                onFocus={() => onAmountFocus(true)}
                onBlur={() => onAmountFocus(false)}
                onChange={(e) => onAmountChange(ValueConverter.parse(e.target.value, currencyFormat))}
                readOnly={!allowPriceOverride}
                className={allowPriceOverride ? "" : "bg-white/5 opacity-70"}
                leftIcon={<CreditCard size={16} />}
              />
              {!allowPriceOverride && (
                <p className="text-[10px] text-slate-500 italic">Basado en el plan. No editable.</p>
              )}
            </div>
          </div>
        </div>
      ) : (
        <div className="flex items-center justify-between p-4 bg-white/2 border border-white/5 rounded-2xl animate-in fade-in slide-in-from-top-1 duration-300">
          <div className="flex flex-col">
            <Text className="text-[10px] font-bold text-white/40 uppercase tracking-widest">A recibir</Text>
            <Text size="lg" weight="bold" className="text-primary tabular-nums">
              {ValueConverter.format(finalAmount, paymentCurrency, currencyFormat)}
            </Text>
          </div>
          <div className="text-right">
            <Text className="text-[10px] font-bold text-white/40 uppercase tracking-widest">Método</Text>
            <Text size="sm" weight="bold" className="text-white uppercase">
              {selectedPaymentConfig?.name || "Efectivo / Otro"}
            </Text>
          </div>
        </div>
      )}

      {/* Dynamic Fields */}
      {selectedPaymentConfig && selectedPaymentConfig.fields.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-2 border-t border-white/5">
          {selectedPaymentConfig.fields.map(field => (
            <div key={field.id} className={cn("space-y-2", field.type === 'file' && "md:col-span-2")}>
              <Label className="text-[10px] font-bold text-white/40 uppercase tracking-widest flex items-center gap-1">
                {field.label}
                {field.required && <span className="text-red-500">*</span>}
              </Label>

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
                  className="h-10 bg-white/5 border-white/5"
                />
              )}
            </div>
          ))}
        </div>
      )}

      {paymentMethodId === 'other' && (
        <div className="space-y-2 animate-in fade-in slide-in-from-top-1 duration-300">
          <Label id="other-method-details-label" className="text-xs font-semibold text-slate-400 uppercase">Especificar Método / Referencia</Label>
          <Input
            id="other-method-details"
            placeholder="Ej: Transferencia Banco Mercantil..."
            value={paymentDetails}
            onChange={(e) => onPaymentDetailsChange(e.target.value)}
            aria-labelledby="other-method-details-label"
          />
        </div>
      )}
    </Card>
  );
}
