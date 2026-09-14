"use client";

import * as React from "react";
import { Building2 } from "lucide-react";
import { Card } from "@workspace/ui/components/card";
import { Text } from "@workspace/ui/components/text";
import { Input } from "@workspace/ui/components/input";
import { Button } from "@workspace/ui/components/button";
import { CountrySelector } from "@workspace/ui/components/country-selector";
import { PLATFORM_SETTINGS_KEYS } from "@/lib/config/platform-settings";
import { mutationError } from "@/lib/errors";
import { api } from "@/lib/api/client";
import { Title, toast } from "@workspace/ui";
import { COUNTRY_LIST } from "@workspace/shared/constants";

interface PlatformEmitterSettingsProps {
  readonly initialSettings: Record<string, string>;
  readonly onSaved?: () => void | Promise<void>;
}

/**
 * Identidad legal del emisor FitStack (C1, comprobantes Console).
 * Todos los campos son opcionales: vacíos = emisor genérico "FitStack" +
 * gate "Comprobante de pago" (nunca "Factura"). Sin nota de obligatorios.
 */
export function PlatformEmitterSettings({
  initialSettings,
  onSaved,
}: PlatformEmitterSettingsProps) {
  const [legalName, setLegalName] = React.useState<string>(
    () => initialSettings[PLATFORM_SETTINGS_KEYS.FITSTACK_LEGAL_NAME] || "",
  );
  const [taxId, setTaxId] = React.useState<string>(
    () => initialSettings[PLATFORM_SETTINGS_KEYS.FITSTACK_TAX_ID] || "",
  );
  const [address, setAddress] = React.useState<string>(
    () => initialSettings[PLATFORM_SETTINGS_KEYS.FITSTACK_ADDRESS] || "",
  );
  const [countryCode, setCountryCode] = React.useState<string>(
    () => initialSettings[PLATFORM_SETTINGS_KEYS.FITSTACK_COUNTRY_CODE] || "",
  );
  const [isUpdating, setIsUpdating] = React.useState(false);

  const handleSave = async () => {
    setIsUpdating(true);
    try {
      await api("/platform/settings", {
        method: "POST",
        body: {
          [PLATFORM_SETTINGS_KEYS.FITSTACK_LEGAL_NAME]: legalName.trim(),
          [PLATFORM_SETTINGS_KEYS.FITSTACK_TAX_ID]: taxId.trim(),
          [PLATFORM_SETTINGS_KEYS.FITSTACK_ADDRESS]: address.trim(),
          [PLATFORM_SETTINGS_KEYS.FITSTACK_COUNTRY_CODE]: countryCode,
        },
      });

      toast.success("Identidad del emisor actualizada correctamente");
      await onSaved?.();
    } catch (error) {
      toast.error(
        mutationError(
          "PlatformEmitterSettings",
          error,
          "No se pudo guardar la identidad del emisor",
        ),
      );
    } finally {
      setIsUpdating(false);
    }
  };

  return (
    <div
      className="space-y-12 pb-20 animate-in fade-in slide-in-from-bottom-2 duration-500"
      data-testid="emitter-section"
    >
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
        <div className="space-y-1">
          <Title as="h3" size="card" className="tracking-tight">Emisor</Title>
          <Text variant="muted">
            Define la identidad legal de FitStack como emisor de los
            comprobantes de pago de suscripciones. Vacío = emisor genérico.
          </Text>
        </div>
        <Button onClick={handleSave} disabled={isUpdating} data-testid="emitter-save">
          {isUpdating ? "Guardando…" : "Guardar"}
        </Button>
      </div>

      <div className="space-y-8 max-w-4xl">
        <Card variant="settings">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center border border-primary/20">
              <Building2 className="w-5 h-5 text-primary" />
            </div>
            <div>
              <Text className="font-bold">Identidad del Emisor</Text>
              <Text className="text-[10px] text-foreground-dim uppercase tracking-wider font-bold">Datos legales de FitStack</Text>
            </div>
          </div>

          <div className="space-y-6">
            <Input
              label="Nombre Legal / Razón Social"
              value={legalName}
              onChange={(e) => setLegalName(e.target.value)}
              placeholder="FitStack C.A."
              disabled={isUpdating}
              data-testid="emitter-legal-name"
            />
            <Input
              label="ID Fiscal (RIF / NIT / RFC)"
              value={taxId}
              onChange={(e) => setTaxId(e.target.value)}
              placeholder="J-123456789"
              disabled={isUpdating}
              data-testid="emitter-tax-id"
            />
            <Input
              label="Dirección Fiscal"
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              placeholder="Av. Principal, Caracas"
              disabled={isUpdating}
              data-testid="emitter-address"
            />
            <CountrySelector
              value={countryCode}
              onChange={setCountryCode}
              countries={COUNTRY_LIST}
              label="País del Emisor"
              placeholder="Sin país (emisor genérico)"
            />
            {countryCode && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setCountryCode("")}
                disabled={isUpdating}
                data-testid="emitter-clear-country"
              >
                Quitar país (volver a emisor genérico)
              </Button>
            )}
          </div>
        </Card>
      </div>
    </div>
  );
}
