"use client";

import * as React from "react";
import {
  Coins,
  AlertCircle,
  Globe,
  BadgeDollarSign
} from "lucide-react";
import { Card } from "@workspace/ui/components/card";
import { Text } from "@workspace/ui/components/text";
import { Button } from "@workspace/ui/components/button";
import { ActiveCurrenciesField } from "@workspace/ui/components";
import { useSettings, SETTINGS_KEYS } from "@/lib/hooks/use-settings";
import { useAuth } from "@/lib/hooks/use-auth";
import { Title, toast } from "@workspace/ui";
import { COUNTRY_INDEX } from "@workspace/shared";

export default function CurrencySettingsPage() {
  const { settings, isLoading, isUpdating, updateSettings } = useSettings();
  const { activeOrganization } = useAuth();

  // Moneda principal y formato: columnas de la org (la principal deriva del
  // país y el formato se edita en Configuración de Sede). Aquí solo se
  // gestionan las monedas activas (extensible, fallback []).
  const primaryCurrency = activeOrganization?.primaryCurrency ?? "";
  const [activeCurrencies, setActiveCurrencies] = React.useState<string[]>([]);

  React.useEffect(() => {
    if (settings) {
      const activeCurs = settings[SETTINGS_KEYS.ACTIVE_CURRENCIES];
      if (activeCurs) {
        try {
          setActiveCurrencies(JSON.parse(activeCurs));
        } catch (e) {
          console.error("Error parsing active currencies:", e);
          toast.error("Error al cargar las monedas configuradas");
          setActiveCurrencies([]);
        }
      } else {
        setActiveCurrencies([]);
      }
    }
  }, [settings]);

  const handleSave = async () => {
    try {
      await updateSettings({
        [SETTINGS_KEYS.ACTIVE_CURRENCIES]: JSON.stringify(activeCurrencies),
      });
    } catch (error) {
      console.error("Error saving currency settings:", error);
    }
  };

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
              <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-primary/5 border border-primary/20 text-white w-fit">
                <span className="font-mono font-bold text-xs">{primaryCurrency}</span>
                <BadgeDollarSign className="w-3 h-3 text-primary" />
              </div>
              <div className="flex gap-2">
                <AlertCircle className="w-3.5 h-3.5 text-white/20 shrink-0" />
                <Text className="text-[9px] text-white/40 leading-relaxed italic">
                  * Derivada del país de operación. El dashboard unificará los totales a esta moneda utilizando los tipos de cambio del día.
                </Text>
              </div>
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
