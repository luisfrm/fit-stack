"use client";

import * as React from "react";
import {
  Coins,
  Search,
  CheckCircle2,
  AlertCircle,
  TrendingUp,
  Globe,
  BadgeDollarSign
} from "lucide-react";
import { Card } from "@workspace/ui/components/card";
import { Text } from "@workspace/ui/components/text";
import { Input } from "@workspace/ui/components/input";
import { Button } from "@workspace/ui/components/button";
import { useSettings, SETTINGS_KEYS } from "@/lib/hooks/use-settings";
import { currencyService } from "@/lib/services/currency-service";
import { Title, toast } from "@workspace/ui";
import { cn } from "@workspace/ui/lib/utils";

export default function CurrencySettingsPage() {
  const { settings, isLoading, isUpdating, updateSettings } = useSettings();

  const [activeCurrencies, setActiveCurrencies] = React.useState<string[]>([]);
  const [primaryCurrency, setPrimaryCurrency] = React.useState<string>("USD");
  const [allCurrencies, setAllCurrencies] = React.useState<string[]>([]);
  const [searchQuery, setSearchQuery] = React.useState("");
  const [isFetchingCodes, setIsFetchingCodes] = React.useState(false);
  const [isEditingCurrencies, setIsEditingCurrencies] = React.useState(false);
  const [currencyFormat, setCurrencyFormat] = React.useState<"latam" | "usa">("latam");

  React.useEffect(() => {
    if (settings) {
      const activeCurs = settings[SETTINGS_KEYS.ACTIVE_CURRENCIES];
      if (activeCurs) {
        try {
          setActiveCurrencies(JSON.parse(activeCurs));
        } catch (e) {
          console.error("Error parsing active currencies:", e);
          toast.error("Error al cargar las monedas configuradas");
          setActiveCurrencies(["USD"]);
        }
      } else {
        setActiveCurrencies(["USD"]);
      }

      const primaryCur = settings[SETTINGS_KEYS.PRIMARY_CURRENCY];
      if (primaryCur) {
        setPrimaryCurrency(primaryCur);
      }

      const format = settings[SETTINGS_KEYS.CURRENCY_FORMAT];
      if (format === "usa" || format === "latam") {
        setCurrencyFormat(format);
      }
    }
  }, [settings]);

  React.useEffect(() => {
    const fetchCodes = async () => {
      setIsFetchingCodes(true);
      try {
        const data = await currencyService.getExchangeRates();
        if (data.result === "success") {
          setAllCurrencies(Object.keys(data.rates).sort((a, b) => a.localeCompare(b)));
        }
      } catch (error) {
        console.error("Error fetching currency codes:", error);
      } finally {
        setIsFetchingCodes(false);
      }
    };
    fetchCodes();
  }, []);

  const handleToggleCurrency = (code: string) => {
    const exists = activeCurrencies.includes(code);
    if (exists && code === primaryCurrency) {
      toast.warning("No puedes desactivar la moneda principal");
      return;
    }

    setActiveCurrencies(prev =>
      exists
        ? prev.filter(c => c !== code)
        : [...prev, code]
    );
  };

  const handleSave = async () => {
    try {
      await updateSettings({
        [SETTINGS_KEYS.ACTIVE_CURRENCIES]: JSON.stringify(activeCurrencies),
        [SETTINGS_KEYS.PRIMARY_CURRENCY]: primaryCurrency,
        [SETTINGS_KEYS.CURRENCY_FORMAT]: currencyFormat,
      });
    } catch (error) {
      console.error("Error saving currency settings:", error);
    }
  };

  const filteredCurrencies = React.useMemo(() => {
    return allCurrencies
      .filter(c => c.toLowerCase().includes(searchQuery.toLowerCase()))
      .sort((a, b) => {
        const aActive = activeCurrencies.includes(a);
        const bActive = activeCurrencies.includes(b);

        if (aActive && !bActive) return -1;
        if (!aActive && bActive) return 1;
        return a.localeCompare(b);
      });
  }, [allCurrencies, searchQuery, activeCurrencies]);

  if (isLoading) return null;

  return (
    <div className="space-y-12 pb-20 animate-in fade-in slide-in-from-bottom-2 duration-500">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
        <div className="space-y-1">
          <Title as="h3" size="card" className="tracking-tight">Monedas</Title>
          <Text variant="muted">Configura las divisas activas y la moneda principal de reporte.</Text>
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
            {isEditingCurrencies ? (
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
                    variant="ghost"
                    size="sm"
                    onClick={() => setIsEditingCurrencies(false)}
                    className="text-white/40 hover:text-white h-12"
                  >
                    Cerrar
                  </Button>
                </div>

                <div className="h-[250px] overflow-y-auto pr-2 space-y-1 scrollbar-thin scrollbar-thumb-white/10">
                  {isFetchingCodes ? (
                    <div className="flex items-center justify-center h-full">
                      <TrendingUp className="w-5 h-5 text-primary animate-pulse" />
                    </div>
                  ) : filteredCurrencies.map(code => (
                    <Button
                      key={code}
                      variant={activeCurrencies.includes(code) ? "glass" : "ghost"}
                      fullWidth
                      onClick={() => handleToggleCurrency(code)}
                      className="justify-between px-4 h-12"
                      rightIcon={activeCurrencies.includes(code) ? <CheckCircle2 className="w-4 h-4 text-primary" /> : null}
                    >
                      <span className="font-mono font-bold text-[11px]">{code}</span>
                    </Button>
                  ))}
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <Text className="text-[10px] font-bold text-white/40 uppercase tracking-widest">Monedas Activas</Text>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setIsEditingCurrencies(true)}
                    className="text-primary hover:bg-primary/10 h-7 text-[10px] font-bold uppercase"
                  >
                    Modificar Lista
                  </Button>
                </div>
                <div className="flex flex-wrap gap-2">
                  {activeCurrencies.map(code => (
                    <div
                      key={code}
                      className="flex items-center gap-2 px-3 py-2 rounded-xl bg-primary/5 border border-primary/20 text-white"
                    >
                      <span className="font-mono font-bold text-xs">{code}</span>
                      {code === primaryCurrency && <BadgeDollarSign className="w-3 h-3 text-primary" />}
                    </div>
                  ))}
                  {activeCurrencies.length === 0 && (
                    <Text className="text-xs text-white/20 italic">No hay monedas seleccionadas.</Text>
                  )}
                </div>
              </div>
            )}

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
              Las divisas seleccionadas estarán disponibles para pagos y reportes inmediatamente.
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
