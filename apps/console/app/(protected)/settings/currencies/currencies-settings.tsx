"use client";

import * as React from "react";
import {
  Coins,
  AlertCircle,
  Globe
} from "lucide-react";
import { Card } from "@workspace/ui/components/card";
import { Text } from "@workspace/ui/components/text";
import { Button } from "@workspace/ui/components/button";
import { ActiveCurrenciesField } from "@workspace/ui/components";
import { PLATFORM_SETTINGS_KEYS } from "@/lib/config/platform-settings";
import { api } from "@/lib/api/client";
import { Title, toast } from "@workspace/ui";
import { cn } from "@workspace/ui/lib/utils";
import { COUNTRY_INDEX } from "@workspace/shared";

interface PlatformCurrenciesSettingsProps {
  readonly initialSettings: Record<string, string>;
  readonly onSaved?: () => void | Promise<void>;
}

export function PlatformCurrenciesSettings({
  initialSettings,
  onSaved,
}: PlatformCurrenciesSettingsProps) {
  const [activeCurrencies, setActiveCurrencies] = React.useState<string[]>(() => {
    const raw = initialSettings[PLATFORM_SETTINGS_KEYS.ACTIVE_CURRENCIES];
    if (!raw) return [];
    try {
      return JSON.parse(raw) as string[];
    } catch {
      return [];
    }
  });
  const [primaryCurrency, setPrimaryCurrency] = React.useState<string>(
    () => initialSettings[PLATFORM_SETTINGS_KEYS.PRIMARY_CURRENCY] || "",
  );
  const [isUpdating, setIsUpdating] = React.useState(false);
  const [currencyFormat, setCurrencyFormat] = React.useState<"latam" | "usa">(() => {
    const f = initialSettings[PLATFORM_SETTINGS_KEYS.CURRENCY_FORMAT];
    return f === "usa" || f === "latam" ? f : "latam";
  });

  const handleSave = async () => {
    setIsUpdating(true);
    try {
      await api("/platform/settings", {
        method: "POST",
        body: {
          [PLATFORM_SETTINGS_KEYS.ACTIVE_CURRENCIES]: JSON.stringify(activeCurrencies),
          [PLATFORM_SETTINGS_KEYS.PRIMARY_CURRENCY]: primaryCurrency,
          [PLATFORM_SETTINGS_KEYS.CURRENCY_FORMAT]: currencyFormat,
        },
      });
      toast.success("Configuración actualizada correctamente");
      await onSaved?.();
    } catch (error) {
      console.error("Error saving currency settings:", error);
      toast.error("Error al guardar la configuración de monedas");
    } finally {
      setIsUpdating(false);
    }
  };

  return (
    <div className="space-y-12 pb-20 animate-in fade-in slide-in-from-bottom-2 duration-500">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
        <div className="space-y-1">
          <Title as="h3" size="card" className="tracking-tight">Monedas</Title>
          <Text variant="muted">Configura las divisas activas y la moneda principal para todo el SaaS.</Text>
        </div>
      </div>

      <div className="space-y-8 max-w-4xl">
        <Card variant="settings">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center border border-primary/20">
              <Coins className="w-5 h-5 text-primary" />
            </div>
            <div>
              <Text className="font-bold">Configuración de Divisas</Text>
              <Text className="text-[10px] text-foreground-dim uppercase tracking-wider font-bold">Activa o desactiva monedas globales</Text>
            </div>
          </div>

          <div className="space-y-6">
            <ActiveCurrenciesField
              currencies={COUNTRY_INDEX.currencies}
              value={activeCurrencies}
              onChange={setActiveCurrencies}
              locked={primaryCurrency ? [primaryCurrency] : []}
              onLockedAttempt={() => toast.warning("No puedes desactivar la moneda principal")}
            />

            <div className="p-4 bg-primary/5 rounded-2xl border border-primary/10 space-y-4">
              <div className="flex items-center gap-2">
                <Globe className="w-4 h-4 text-primary" />
                <Text className="text-[10px] font-bold text-white/80 uppercase tracking-wider">Moneda Principal de Reporte</Text>
              </div>
              <div className="grid grid-cols-4 sm:grid-cols-6 gap-2">
                {activeCurrencies.map(code => (
                  <Button
                    key={`primary-${code}`}
                    variant={primaryCurrency === code ? "primary" : "glass"}
                    size="xs"
                    onClick={() => setPrimaryCurrency(code)}
                  >
                    {code}
                  </Button>
                ))}
              </div>
              <div className="flex gap-2">
                <AlertCircle className="w-3.5 h-3.5 text-white/20 shrink-0" />
                <Text className="text-[9px] text-white/40 leading-relaxed italic">
                  * El dashboard unificará los totales a esta moneda utilizando los tipos de cambio del día.
                </Text>
              </div>
            </div>

            <div className="p-4 bg-white/1 border border-white/5 rounded-2xl space-y-4">
              <div className="flex items-center gap-2">
                <Globe className="w-4 h-4 text-primary" />
                <Text className="text-[10px] font-bold text-white/80 uppercase tracking-wider">Formato de Moneda</Text>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <Button
                  variant={currencyFormat === "latam" ? "glass" : "ghost"}
                  onClick={() => setCurrencyFormat("latam")}
                  className="flex flex-col items-start p-4 h-auto gap-1"
                >
                  <Text className={cn("text-xs font-bold", currencyFormat === "latam" ? "text-primary" : "text-white/60")}>LATAM / EU</Text>
                  <Text className="text-[10px] opacity-40 font-mono">1.250,50</Text>
                </Button>
                <Button
                  variant={currencyFormat === "usa" ? "glass" : "ghost"}
                  onClick={() => setCurrencyFormat("usa")}
                  className="flex flex-col items-start p-4 h-auto gap-1"
                >
                  <Text className={cn("text-xs font-bold", currencyFormat === "usa" ? "text-primary" : "text-white/60")}>USA / UK</Text>
                  <Text className="text-[10px] opacity-40 font-mono">1,250.50</Text>
                </Button>
              </div>
              <Text className="text-[9px] text-white/20 italic block px-2">
                Define cómo se muestran los separadores de miles y decimales en todo el sistema.
              </Text>
            </div>
          </div>
        </Card>

        {/* ACCIONES FINALES */}
        <Card variant="settings" className="justify-between relative z-10 p-6 sm:p-8">
          <div className="flex flex-col gap-1.5">
            <Text weight="bold" size="lg" className="tracking-tight">¿Deseas aplicar estos cambios?</Text>
            <Text variant="muted" size="sm" className="leading-relaxed">
              Las divisas seleccionadas serán la configuración global del SaaS.
            </Text>
          </div>

          <div className="flex flex-col-reverse md:flex-row items-center gap-3 w-full md:w-auto mt-4 md:mt-0">
            <Button
              onClick={handleSave}
              loading={isUpdating}
              disabled={activeCurrencies.length === 0}
              className="w-full md:w-auto md:px-8 h-14 md:h-12 text-sm font-bold uppercase tracking-[0.1em]"
            >
              Guardar Cambios de Moneda
            </Button>
          </div>
        </Card>
      </div>
    </div>
  );
}
